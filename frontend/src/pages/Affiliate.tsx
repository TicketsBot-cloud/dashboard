import { useState, useEffect, useCallback } from "react";
import { MainLayout } from "@/pages/layout/Main";
import { Link } from "react-router";
import { apiClient } from "@/lib/api";
import { toast } from "sonner";
import Button from "@/components/Button";
import Table from "@/components/Table";
import TextInput from "@/components/TextInput";
import ConfirmModal from "@/components/modals/ConfirmModal";
import Pagination from "@/components/Pagination";
import CardGridSkeleton from "@/components/skeletons/CardGridSkeleton";
import { BASE_URL } from "@/lib/constants";
import type { AffiliateCode, AffiliateReferral } from "@/types";

const REFERRALS_PER_PAGE = 25;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function StatusBadge({ status }: { status: string }) {
  const colours: Record<string, string> = {
    pending: "bg-amber-600",
    redeemable: "bg-green-600",
    redeemed: "bg-blue-600",
    voided: "bg-red-600",
    flagged: "bg-red-500",
  };

  return (
    <span
      className={`inline-block text-white text-xs px-2 py-0.5 rounded capitalize ${colours[status] ?? "bg-gray-600"}`}
    >
      {status}
    </span>
  );
}

export default function Affiliate() {
  const [affiliateCode, setAffiliateCode] = useState<AffiliateCode | null>(null);
  const [referrals, setReferrals] = useState<AffiliateReferral[]>([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [redeeming, setRedeeming] = useState(false);
  const [preferredCode, setPreferredCode] = useState("");
  const [showRedeemModal, setShowRedeemModal] = useState(false);
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const [hasEntitlement, setHasEntitlement] = useState(false);
  const [hasWhitelabel, setHasWhitelabel] = useState(false);
  const [effectiveCreditPercent, setEffectiveCreditPercent] = useState(5);
  const [referralPage, setReferralPage] = useState(1);
  const [referralTotal, setReferralTotal] = useState(0);
  const [referralsLoading, setReferralsLoading] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const res = await apiClient.affiliate.get();
      const data = res.data;
      setEffectiveCreditPercent(data.effective_credit_percent);
      setHasEntitlement(data.has_entitlement);
      setHasWhitelabel(data.has_whitelabel);
      if (data.code) {
        setAffiliateCode({
          ...data.code,
          stats: {
            total_referrals: data.total_referrals,
            pending_referrals: data.pending_referrals,
            redeemable_credits: data.redeemable_credits,
            redeemed_credits: data.redeemed_credits,
            cap_remaining: data.cap_remaining,
          },
        });
        if (data.code.status === "active") {
          setReferralsLoading(true);
          const refRes = await apiClient.affiliate.getReferrals(referralPage, REFERRALS_PER_PAGE);
          setReferrals(refRes.data.referrals);
          setReferralTotal(refRes.data.total ?? 0);
          setReferralsLoading(false);
        } else {
          setReferrals([]);
          setReferralTotal(0);
        }
      } else {
        setAffiliateCode(null);
        setReferrals([]);
        setReferralTotal(0);
      }
    } catch {
      // Interceptor handles error display
    } finally {
      setReferralsLoading(false);
      setLoading(false);
    }
  }, [referralPage]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleApply = async () => {
    setApplying(true);
    try {
      const res = await apiClient.affiliate.apply(undefined, preferredCode.trim() || undefined);
      setAffiliateCode(res.data.code);
      toast.success("Affiliate application submitted successfully.");
    } catch {
      // Interceptor handles error display
    } finally {
      setApplying(false);
    }
  };

  const handleRedeem = async () => {
    setRedeeming(true);
    try {
      const res = await apiClient.affiliate.redeem();
      const data = res.data;
      const totalDays = data.total_days ?? 0;
      if (data.redeemed_count > 0 && totalDays > 0) {
        const daysLabel = `${totalDays} day${totalDays !== 1 ? "s" : ""}`;
        const tierLabel = data.tier ?? "premium";
        if (data.method === "subscription_extended") {
          toast.success(`Your ${tierLabel} subscription has been extended by ${daysLabel}.`);
        } else {
          toast.success(
            `Redeemed ${data.total_credits ?? data.redeemed_count} credits for ${daysLabel} of ${tierLabel}.`,
          );
        }
      } else {
        toast.info(data.message ?? "No credits available to redeem at this time.");
      }
      await loadData();
    } catch {
      // Interceptor handles error display
    } finally {
      setRedeeming(false);
      setShowRedeemModal(false);
    }
  };

  const handleCopy = async (type: "code" | "link") => {
    if (!affiliateCode) return;
    const text = type === "code" ? affiliateCode.code : `${BASE_URL}?ref=${affiliateCode.code}`;
    await navigator.clipboard.writeText(text);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  };

  if (loading) {
    return (
      <MainLayout
        title="Affiliate Programme"
        subtitle="Earn premium credit by referring new subscribers"
      >
        <CardGridSkeleton cards={4} />
      </MainLayout>
    );
  }

  // No code - show application form
  if (!affiliateCode) {
    return (
      <MainLayout
        title="Affiliate Programme"
        subtitle="Earn premium credit by referring new subscribers"
      >
        <div className="max-w-lg mx-auto">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleApply();
            }}
            className="bg-gray-800 rounded-xl p-6 space-y-4"
          >
            <h2 className="text-xl font-bold text-white">Apply to Become an Affiliate</h2>
            <p className="text-gray-300 text-sm">
              As an affiliate, you receive a unique referral code to share. When someone subscribes
              using your code, they get a discount and you earn premium credit. Premium subscribers
              earn at 10%, everyone else at 5%. Applications are reviewed by our team.
            </p>
            <TextInput
              label="Preferred code (optional)"
              value={preferredCode}
              onChange={setPreferredCode}
              placeholder="e.g. TKTS"
              maxLength={6}
              descriptionId="code-hint"
            />
            <p id="code-hint" className="text-gray-300 text-xs">
              Leave blank for an auto-generated code. Codes must be unique and alphanumeric (3-6
              characters).
            </p>
            <p className="text-gray-400 text-xs">
              Manage your email and notification preferences in{" "}
              <Link
                to="/settings"
                className="text-blue-400 hover:text-blue-300 transition-colors underline"
              >
                Settings
              </Link>
              .
            </p>
            <Button
              variant="primary"
              type="submit"
              disabled={applying}
              className="w-full rounded-lg font-medium"
            >
              {applying ? "Submitting..." : "Submit Application"}
            </Button>
          </form>
        </div>
      </MainLayout>
    );
  }

  // Pending status
  if (affiliateCode.status === "pending") {
    return (
      <MainLayout
        title="Affiliate Programme"
        subtitle="Earn premium credit by referring new subscribers"
      >
        <div className="max-w-lg mx-auto space-y-4">
          <div className="bg-gray-800 rounded-xl p-6 text-center space-y-3">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-amber-500/20 mb-2">
              <span className="text-amber-400 text-2xl" aria-hidden="true">
                &#9203;
              </span>
            </div>
            <h2 className="text-xl font-bold text-white">Application Pending</h2>
            <p className="text-gray-300">
              Your affiliate application is awaiting admin approval. We will notify you once it has
              been reviewed.
            </p>
            <p className="text-gray-400 text-sm">
              Applied on {formatDate(affiliateCode.created_at)}
            </p>
            <p className="text-gray-400 text-xs pt-2">
              Manage your email and notification preferences in{" "}
              <Link
                to="/settings"
                className="text-blue-400 hover:text-blue-300 transition-colors underline"
              >
                Settings
              </Link>
              .
            </p>
          </div>
        </div>
      </MainLayout>
    );
  }

  // Revoked status
  if (affiliateCode.status === "revoked") {
    return (
      <MainLayout
        title="Affiliate Programme"
        subtitle="Earn premium credit by referring new subscribers"
      >
        <div className="max-w-lg mx-auto">
          <div className="bg-gray-800 rounded-xl p-6 text-center space-y-3">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-red-500/20 mb-2">
              <span className="text-red-400 text-2xl" aria-hidden="true">
                &#10007;
              </span>
            </div>
            <h2 className="text-xl font-bold text-white">Code Revoked</h2>
            <p className="text-gray-300">
              Your affiliate code has been revoked. If you believe this is an error, please contact
              support.
            </p>
          </div>
        </div>
      </MainLayout>
    );
  }

  // Active status - full dashboard
  const stats = affiliateCode.stats;
  const redeemableCredits = stats?.redeemable_credits ?? 0;
  const redeemedCredits = stats?.redeemed_credits ?? 0;
  const capRemaining = stats?.cap_remaining ?? 365;
  const creditsPerDay = hasWhitelabel ? 2 : 1;
  const redeemableDays = Math.floor(redeemableCredits / creditsPerDay);
  const referralTotalPages = Math.max(1, Math.ceil(referralTotal / REFERRALS_PER_PAGE));

  return (
    <MainLayout
      title="Affiliate Programme"
      subtitle="Earn premium credit by referring new subscribers"
    >
      <div className="space-y-6">
        {/* Code & referral link */}
        <div className="bg-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Your Affiliate Code</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <span className="text-sm text-gray-400 block mb-1">Code</span>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-gray-900 text-white px-3 py-3 rounded font-mono text-sm">
                  {affiliateCode.code}
                </code>
                <Button
                  variant="secondary"
                  size="md"
                  onClick={() => handleCopy("code")}
                  title="Copy affiliate code"
                >
                  {copied === "code" ? "Copied!" : "Copy"}
                </Button>
                {copied === "code" && (
                  <span role="status" className="sr-only">
                    Affiliate code copied to clipboard
                  </span>
                )}
              </div>
            </div>
            <div>
              <span className="text-sm text-gray-400 block mb-1">Referral Link</span>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-gray-900 text-white px-3 py-3 rounded font-mono text-sm truncate">
                  {BASE_URL}?ref={affiliateCode.code}
                </code>
                <Button
                  variant="secondary"
                  size="md"
                  onClick={() => handleCopy("link")}
                  title="Copy referral link"
                >
                  {copied === "link" ? "Copied!" : "Copy"}
                </Button>
                {copied === "link" && (
                  <span role="status" className="sr-only">
                    Referral link copied to clipboard
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-4 text-sm text-gray-400">
            <span>Discount: {(affiliateCode.discount_basis_points / 100).toFixed(0)}%</span>
            <span>
              Credit: {effectiveCreditPercent}%
              {hasEntitlement && (
                <span className="ml-1 text-xs text-green-400">(premium rate)</span>
              )}
              {!hasEntitlement && (
                <span className="ml-1 text-xs text-gray-400">
                  (upgrade to premium for{" "}
                  {effectiveCreditPercent < 10 ? "10" : effectiveCreditPercent}%)
                </span>
              )}
            </span>
            {affiliateCode.approved_at && (
              <span>Active since {formatDate(affiliateCode.approved_at)}</span>
            )}
          </div>
        </div>

        {/* Settings link */}
        <div className="bg-gray-800 rounded-xl p-4 flex items-center justify-between">
          <p className="text-sm text-gray-300">
            Manage your email and notification preferences in{" "}
            <Link
              to="/settings"
              className="text-blue-400 hover:text-blue-300 transition-colors underline"
            >
              Settings
            </Link>
            .
          </p>
        </div>

        {/* Stats cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-gray-800 rounded-xl p-5">
            <p className="text-sm text-gray-400 mb-1">Total Referrals</p>
            <p className="text-2xl font-bold text-white">{stats?.total_referrals ?? 0}</p>
          </div>
          <div className="bg-gray-800 rounded-xl p-5">
            <p className="text-sm text-gray-400 mb-1">Pending</p>
            <p className="text-2xl font-bold text-amber-400">{stats?.pending_referrals ?? 0}</p>
            <p className="mt-1 text-xs text-gray-400">In 14-day cooling period</p>
          </div>
          <div className="bg-gray-800 rounded-xl p-5">
            <p className="text-sm text-gray-400 mb-1">Redeemable Credits</p>
            <p className="text-2xl font-bold text-green-400">{redeemableCredits}</p>
            {redeemableCredits > 0 && (
              <p className="mt-1 text-xs text-gray-400">
                = {redeemableDays} days of {hasWhitelabel ? "whitelabel" : "premium"}
              </p>
            )}
          </div>
          <div className="bg-gray-800 rounded-xl p-5">
            <p className="text-sm text-gray-400 mb-1">Redeemed Credits</p>
            <p className="text-2xl font-bold text-blue-400">{redeemedCredits}</p>
            <p className="mt-1 text-xs text-gray-400">{capRemaining} of 365 remaining</p>
          </div>
        </div>

        {/* Redeem button */}
        {redeemableCredits > 0 && (
          <div className="flex flex-col items-center gap-2">
            <Button
              variant="success"
              onClick={() => setShowRedeemModal(true)}
              className="rounded-lg font-medium px-8"
            >
              Redeem {redeemableCredits} Credits ({redeemableDays} days)
            </Button>
            {hasEntitlement && (
              <p className="text-xs text-gray-300">
                This will extend your {hasWhitelabel ? "whitelabel" : "premium"} subscription by{" "}
                {redeemableDays} days.
              </p>
            )}
          </div>
        )}

        {/* Referrals table */}
        <div className="bg-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Referrals</h2>

          {referrals.length === 0 ? (
            <p className="text-gray-300 text-center py-6">
              No referrals yet. Share your referral link to get started.
            </p>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block">
                <Table variant="compact">
                  <Table.Head>
                    <Table.Row>
                      <Table.HeaderCell>Tier</Table.HeaderCell>
                      <Table.HeaderCell>Purchased</Table.HeaderCell>
                      <Table.HeaderCell>Credit</Table.HeaderCell>
                      <Table.HeaderCell>Status</Table.HeaderCell>
                      <Table.HeaderCell>Date</Table.HeaderCell>
                      <Table.HeaderCell>Redeemable</Table.HeaderCell>
                    </Table.Row>
                  </Table.Head>
                  <Table.Body>
                    {referrals.map((ref) => (
                      <Table.Row key={ref.id}>
                        <Table.Cell className="px-4 py-3 capitalize">
                          {ref.referred_tier}
                        </Table.Cell>
                        <Table.Cell>{ref.purchased_days} days</Table.Cell>
                        <Table.Cell>{ref.credit_days} days</Table.Cell>
                        <Table.Cell>
                          <StatusBadge status={ref.status} />
                        </Table.Cell>
                        <Table.Cell>{formatDate(ref.created_at)}</Table.Cell>
                        <Table.Cell>
                          {ref.redeemable_at ? formatDate(ref.redeemable_at) : "-"}
                        </Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table>
              </div>

              {/* Mobile cards */}
              <div className="md:hidden space-y-3">
                {referrals.map((ref) => (
                  <div key={ref.id} className="bg-gray-900/50 rounded-lg p-4 space-y-2">
                    <div className="flex justify-between items-start">
                      <span className="text-white capitalize">{ref.referred_tier}</span>
                      <StatusBadge status={ref.status} />
                    </div>
                    <div className="text-sm text-gray-300">
                      {ref.purchased_days} days purchased &middot; {ref.credit_days} days credit
                    </div>
                    <div className="text-xs text-gray-400">
                      {formatDate(ref.created_at)}
                      {ref.redeemable_at && ` • Redeemable ${formatDate(ref.redeemable_at)}`}
                    </div>
                  </div>
                ))}
              </div>
              <Pagination
                variant="full"
                page={referralPage}
                totalPages={referralTotalPages}
                onChange={setReferralPage}
                disabled={referralsLoading}
              />
            </>
          )}
        </div>
      </div>

      {/* Redeem confirmation modal */}
      <ConfirmModal
        isOpen={showRedeemModal}
        title="Redeem Affiliate Credits"
        message={
          <div className="space-y-3">
            <div className="space-y-2">
              <p className="text-sm text-white">
                <span className="font-semibold">{redeemableCredits}</span> credits ={" "}
                <span className="font-semibold">{redeemableDays}</span> days of{" "}
                <span className="capitalize">{hasWhitelabel ? "whitelabel" : "premium"}</span>
                {hasWhitelabel && (
                  <span className="text-gray-400 text-xs ml-1">(2 credits per day)</span>
                )}
              </p>
              {hasEntitlement ? (
                <p className="text-gray-300 text-sm">
                  Your {hasWhitelabel ? "whitelabel" : "premium"} subscription will be extended by{" "}
                  {redeemableDays} days. The extra time is added to the end of your current billing
                  period.
                </p>
              ) : (
                <p className="text-gray-300 text-sm">
                  This will create a new premium subscription starting from today.
                </p>
              )}
            </div>
          </div>
        }
        confirmText={redeeming ? "Redeeming..." : "Redeem Credits"}
        cancelText="Cancel"
        confirmVariant="success"
        onConfirm={handleRedeem}
        onCancel={() => setShowRedeemModal(false)}
      />
    </MainLayout>
  );
}
