import { useState, useEffect, useCallback } from "react";
import { guildIconUrl } from "@/lib/discord-cdn";
import { MainLayout } from "@/pages/layout/Main";
import Button from "@/components/Button";
import PricingLink from "@/components/PricingLink";
import Table from "@/components/Table";
import ConfirmModal from "@/components/modals/ConfirmModal";
import { apiClient } from "@/lib/api";
import { toast } from "sonner";
import { useAuthStore } from "@/stores/auth";
import { PATREON_URL } from "@/lib/constants";
import { formatCurrency } from "@/lib/currency";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import { PRICING_FLAG } from "@/lib/feature-flags";
import type { UserEntitlement, LegacyEntitlement, PolarSubscription, Guild } from "@/types";

interface SubscriptionData {
  entitlements: UserEntitlement[];
  legacy_entitlement: LegacyEntitlement | null;
  polar_subscriptions: PolarSubscription[];
  permitted_server_count?: number;
  selected_guilds?: string[];
}

interface PolarOrder {
  id: string;
  created_at: string;
  status: string;
  paid: boolean;
  total_amount: number;
  tax_amount: number;
  currency: string;
  billing_reason: string;
  invoice_number: string;
  product_name?: string;
  has_invoice: boolean;
  refunded_amount: number;
}

/** Source badge with colour coding by entitlement source. */
function SourceBadge({ source }: { source: string }) {
  const colours: Record<string, string> = {
    polar: "bg-blue-500",
    patreon: "bg-[#FF424D]",
    discord: "bg-[#5865F2]",
    key: "bg-amber-500",
    voting: "bg-green-600",
  };

  return (
    <span
      className={`inline-block text-white text-xs px-2 py-0.5 rounded capitalize ${colours[source] ?? "bg-gray-600"}`}
    >
      {source}
    </span>
  );
}

/** Tier badge. */
function TierBadge({ tier }: { tier: string }) {
  const colour = tier === "whitelabel" ? "bg-blue-600" : "bg-blue-500";
  return (
    <span className={`inline-block text-white text-xs px-2 py-0.5 rounded capitalize ${colour}`}>
      {tier}
    </span>
  );
}

/** Status display based on expiry. */
function StatusDisplay({ expiresAt }: { expiresAt?: string }) {
  if (!expiresAt) return null;

  const isExpired = new Date(expiresAt) < new Date();
  return (
    <span
      className={`inline-block text-white text-xs px-2 py-0.5 rounded ${
        isExpired ? "bg-red-600" : "bg-green-600"
      }`}
    >
      {isExpired ? "Expired" : "Active"}
    </span>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function Subscription() {
  const [data, setData] = useState<SubscriptionData | null>(null);
  const [guilds, setGuilds] = useState<Guild[]>([]);
  const [selectedGuildIds, setSelectedGuildIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<string | null>(null);
  const [orders, setOrders] = useState<PolarOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);

  const { enabled: billingEnabled } = useFeatureFlag(PRICING_FLAG);

  const loadData = useCallback(async () => {
    try {
      const res = await apiClient.premium.getEntitlements();
      setData(res.data);

      if (res.data.selected_guilds && res.data.selected_guilds.length > 0) {
        setSelectedGuildIds(res.data.selected_guilds);
      }
    } catch {
      // Interceptor handles error display
    } finally {
      setLoading(false);
    }
  }, []);

  const loadOrders = useCallback(async () => {
    setOrdersLoading(true);
    try {
      const res = await apiClient.premium.getOrders();
      setOrders(res.data.orders);
    } catch {
      // Interceptor handles error display
    } finally {
      setOrdersLoading(false);
    }
  }, []);

  useEffect(() => {
    const storedGuilds = useAuthStore.getState().guilds;
    setGuilds(storedGuilds);
    loadData();
  }, [loadData]);

  // enabled is undefined while flags load, so this waits rather than firing on the off path.
  useEffect(() => {
    if (!billingEnabled) return;
    loadOrders();
  }, [billingEnabled, loadOrders]);

  const handleCancel = async () => {
    if (!cancelTarget) return;
    try {
      await apiClient.premium.cancelSubscription(cancelTarget);
      toast.success(
        "Subscription cancelled. It will remain active until the end of the billing period.",
      );
      await loadData();
    } catch {
      // Interceptor handles error display
    } finally {
      setShowCancelModal(false);
      setCancelTarget(null);
    }
  };

  const handleUncancel = async (subId: string) => {
    try {
      await apiClient.premium.uncancelSubscription(subId);
      toast.success("Cancellation reversed. Your subscription will continue.");
      await loadData();
    } catch {
      // Interceptor handles error display
    }
  };

  const handleViewInvoice = async (orderId: string) => {
    try {
      const res = await apiClient.premium.getOrderInvoice(orderId);
      window.open(res.data.invoice_url, "_blank");
    } catch {
      // Interceptor handles error display
    }
  };

  const handleSaveGuilds = async () => {
    try {
      await apiClient.premium.updateActiveGuilds(selectedGuildIds);
      toast.success("Server selection saved.");
    } catch {
      // Interceptor handles error display
    }
  };

  /** Find a Polar subscription matching a given entitlement by SKU. */
  const findPolarSub = (entitlement: UserEntitlement): PolarSubscription | undefined => {
    return data?.polar_subscriptions.find((s) => s.sku_id === entitlement.sku_id);
  };

  if (loading) {
    return (
      <MainLayout title="Your Subscriptions">
        <div className="flex items-center justify-center min-h-50">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        </div>
      </MainLayout>
    );
  }

  const entitlements = data?.entitlements ?? [];
  const legacy = data?.legacy_entitlement;
  const legacyActive = !!legacy && new Date(legacy.expires_at) > new Date();
  const permittedCount = data?.permitted_server_count;
  const hasEntitlements = entitlements.length > 0 || legacyActive;
  const assignableGuilds = [
    ...guilds.filter((g) => g.permission_level === 2 || selectedGuildIds.includes(g.id)),
    ...selectedGuildIds
      .filter((id) => !guilds.some((g) => g.id === id))
      .map((id) => ({
        id,
        name: `Unknown Server ${id}`,
        icon: undefined,
        permission_level: 2,
      })),
  ];

  return (
    <MainLayout
      title="Your Subscriptions"
      subtitle="Manage your active subscriptions and entitlements"
    >
      <div className="space-y-6">
        {!hasEntitlements && (
          <div className="bg-gray-800 rounded-xl p-8 text-center">
            <p className="text-gray-400 mb-4">You don't have any active subscriptions.</p>
            <PricingLink className="inline-block bg-blue-500 hover:bg-blue-600 text-white px-6 py-2.5 rounded-lg font-medium transition-colors">
              View Plans
            </PricingLink>
          </div>
        )}

        {legacyActive && (
          <div className="bg-gray-800 rounded-xl p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-white font-medium">{legacy.sku_label}</span>
                  <SourceBadge source="patreon" />
                  <TierBadge tier={legacy.tier_id >= 1 ? "whitelabel" : "premium"} />
                  <StatusDisplay expiresAt={legacy.expires_at} />
                </div>
                <p className="text-gray-400 text-sm mt-1">
                  {new Date(legacy.expires_at) < new Date() ? "Expired" : "Renews"}{" "}
                  {formatDate(legacy.expires_at)}
                </p>
              </div>
              {legacy.is_legacy && (
                <a
                  href={PATREON_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="border border-[#FF424D] text-[#FF424D] hover:bg-[#FF424D]/10 px-4 py-2 rounded-lg font-medium transition-colors text-sm"
                >
                  Manage on Patreon
                </a>
              )}
            </div>
          </div>
        )}

        {/* Entitlement cards */}
        {entitlements.map((ent) => {
          const polarSub = ent.source === "polar" ? findPolarSub(ent) : undefined;

          return (
            <div key={ent.id} className="bg-gray-800 rounded-xl p-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-white font-medium">{ent.sku_label}</span>
                    <SourceBadge source={ent.source} />
                    <TierBadge tier={ent.tier} />
                    <StatusDisplay expiresAt={ent.expires_at} />
                  </div>
                  {ent.expires_at && (
                    <p className="text-gray-400 text-sm mt-1">
                      {new Date(ent.expires_at) < new Date()
                        ? "Expired"
                        : polarSub?.status === "canceled"
                          ? "Expires"
                          : "Renews"}{" "}
                      {formatDate(ent.expires_at)}
                    </p>
                  )}
                </div>

                {/* Management actions by source */}
                <div className="flex gap-3 flex-wrap">
                  {ent.source === "polar" && polarSub && (
                    <>
                      {polarSub.status === "canceled" ? (
                        <Button
                          variant="success"
                          onClick={() => handleUncancel(polarSub.polar_subscription_id)}
                          className="rounded-lg font-medium text-sm"
                        >
                          Undo Cancellation
                        </Button>
                      ) : (
                        <>
                          <PricingLink className="border border-blue-500 text-blue-400 hover:bg-blue-500/10 px-4 py-2 rounded-lg font-medium transition-colors text-sm">
                            Change Plan
                          </PricingLink>
                          <Button
                            variant="outline"
                            onClick={() => {
                              setCancelTarget(polarSub.polar_subscription_id);
                              setShowCancelModal(true);
                            }}
                            className="border-red-500 text-red-400 hover:bg-red-500/10 rounded-lg font-medium text-sm"
                          >
                            Cancel
                          </Button>
                        </>
                      )}
                    </>
                  )}

                  {ent.source === "patreon" && (
                    <a
                      href={PATREON_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="border border-[#FF424D] text-[#FF424D] hover:bg-[#FF424D]/10 px-4 py-2 rounded-lg font-medium transition-colors text-sm"
                    >
                      Manage on Patreon
                    </a>
                  )}

                  {ent.source === "discord" && (
                    <span className="text-gray-400 text-sm px-4 py-2">Managed via Discord</span>
                  )}

                  {ent.source === "key" && (
                    <span className="text-gray-400 text-sm px-4 py-2">Redeemed Key</span>
                  )}

                  {ent.source === "voting" && (
                    <span className="text-gray-400 text-sm px-4 py-2">Vote Credits</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {/* Server assignment for server-specific plans */}
        {hasEntitlements && permittedCount != null && permittedCount > 0 && (
          <div className="bg-gray-800 rounded-xl p-6">
            <h2 className="text-xl font-bold text-white mb-2">Server Assignment</h2>
            <p className="text-gray-400 text-sm mb-4">
              Select which servers receive premium ({selectedGuildIds.length}/{permittedCount} used)
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mb-4">
              {assignableGuilds.map((guild) => {
                const isSelected = selectedGuildIds.includes(guild.id);
                const isDisabled = !isSelected && selectedGuildIds.length >= (permittedCount ?? 0);
                return (
                  <Button
                    type="button"
                    key={guild.id}
                    onClick={() => {
                      if (isSelected) {
                        setSelectedGuildIds((prev) => prev.filter((id) => id !== guild.id));
                      } else if (!isDisabled) {
                        setSelectedGuildIds((prev) => [...prev, guild.id]);
                      }
                    }}
                    disabled={isDisabled}
                    className={`w-full justify-start p-3 rounded-lg flex items-center gap-2 transition-colors text-left ${
                      isSelected
                        ? "bg-blue-500/20 border border-blue-500"
                        : isDisabled
                          ? "bg-gray-700/50 border border-gray-700 opacity-50"
                          : "bg-gray-700 border border-gray-600 hover:border-gray-500"
                    }`}
                  >
                    {guild.icon ? (
                      <img
                        src={guildIconUrl(guild.id, guild.icon, 32)}
                        alt=""
                        className="w-6 h-6 rounded-full shrink-0"
                      />
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-gray-600 shrink-0 flex items-center justify-center text-xs text-gray-300">
                        {guild.name.charAt(0)}
                      </div>
                    )}
                    <span className="text-sm text-white truncate">{guild.name}</span>
                  </Button>
                );
              })}
            </div>
            <Button variant="success" onClick={handleSaveGuilds} className="rounded-lg font-medium">
              Save Selection
            </Button>
          </div>
        )}
        {/* Billing history */}
        {billingEnabled && !ordersLoading && orders.length > 0 && (
          <div className="bg-gray-800 rounded-xl p-6">
            <h2 className="text-xl font-bold text-white mb-4">Billing History</h2>
            <Table variant="compact">
              <Table.Head>
                <Table.Row className="text-left text-gray-400 border-b border-gray-700">
                  <Table.HeaderCell className="pb-3 pr-4">Date</Table.HeaderCell>
                  <Table.HeaderCell className="pb-3 pr-4">Description</Table.HeaderCell>
                  <Table.HeaderCell className="pb-3 pr-4">Amount</Table.HeaderCell>
                  <Table.HeaderCell className="pb-3 pr-4">Status</Table.HeaderCell>
                  <Table.HeaderCell className="pb-3">Invoice</Table.HeaderCell>
                </Table.Row>
              </Table.Head>
              <Table.Body>
                {orders.map((order) => (
                  <Table.Row key={order.id} className="border-b border-gray-700/50">
                    <Table.Cell className="py-3 pr-4 text-gray-300 whitespace-nowrap">
                      {new Date(order.created_at).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </Table.Cell>
                    <Table.Cell className="py-3 pr-4 text-white">
                      {order.product_name ?? "Subscription"}
                      {order.billing_reason === "subscription_cycle" && (
                        <span className="text-gray-500 ml-1">· Renewal</span>
                      )}
                      {order.billing_reason === "subscription_create" && (
                        <span className="text-gray-500 ml-1">· New</span>
                      )}
                      {order.billing_reason === "subscription_update" && (
                        <span className="text-gray-500 ml-1">· Plan change</span>
                      )}
                    </Table.Cell>
                    <Table.Cell className="py-3 pr-4 text-white whitespace-nowrap">
                      {formatCurrency(order.total_amount, order.currency)}
                      {order.refunded_amount > 0 && (
                        <span className="text-red-400 ml-1 text-xs">
                          ({formatCurrency(order.refunded_amount, order.currency)} refunded)
                        </span>
                      )}
                    </Table.Cell>
                    <Table.Cell className="py-3 pr-4">
                      <span
                        className={`text-xs px-2 py-0.5 rounded ${
                          order.paid
                            ? "bg-green-900/50 text-green-400"
                            : "bg-amber-900/50 text-amber-400"
                        }`}
                      >
                        {order.paid ? "Paid" : "Pending"}
                      </span>
                    </Table.Cell>
                    <Table.Cell className="py-3">
                      {order.has_invoice ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleViewInvoice(order.id)}
                          className="text-blue-400 hover:underline text-sm p-0"
                        >
                          View Invoice
                        </Button>
                      ) : (
                        <span className="text-gray-500 text-sm">-</span>
                      )}
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          </div>
        )}
      </div>

      {/* Cancel confirmation modal */}
      <ConfirmModal
        isOpen={showCancelModal}
        title="Cancel Subscription"
        message={
          <div className="space-y-3">
            <p>Are you sure you want to cancel your subscription?</p>
            <p>
              You will retain access to premium features until the end of your current billing
              period. After that, your servers will lose premium benefits including unlimited
              panels, statistics, branding removal, and other premium features.
            </p>
            <p className="text-amber-400 text-sm">
              This action cannot be undone after the billing period ends. You can resubscribe at any
              time, but your previous pricing is not guaranteed.
            </p>
          </div>
        }
        confirmText="Cancel Subscription"
        cancelText="Keep Subscription"
        confirmVariant="danger"
        onConfirm={handleCancel}
        onCancel={() => {
          setShowCancelModal(false);
          setCancelTarget(null);
        }}
      />
    </MainLayout>
  );
}
