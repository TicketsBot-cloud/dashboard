import { useState, useEffect, useCallback } from "react";
import { MainLayout } from "@/pages/layout/Main";
import Button from "@/components/Button";
import ConfirmModal from "@/components/modals/ConfirmModal";
import TextInput from "@/components/TextInput";
import { apiClient } from "@/lib/api";
import { toast } from "sonner";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronDown, faChevronUp } from "@fortawesome/free-solid-svg-icons";
import type { PolarProduct, PolarSubscription } from "@/types";
import { formatCurrency } from "@/lib/currency";

/** Group products by name, pairing monthly and annual variants. */
interface ProductGroup {
  name: string;
  description: string;
  features: string[];
  highlighted: boolean;
  sort_order: number;
  tier: string;
  currency: string;
  servers_permitted?: number;
  monthly?: PolarProduct;
  annual?: PolarProduct;
}

function groupProducts(products: PolarProduct[]): ProductGroup[] {
  const groups = new Map<string, ProductGroup>();

  for (const product of products) {
    if (!groups.has(product.name)) {
      groups.set(product.name, {
        name: product.name,
        description: product.description,
        features: product.features,
        highlighted: product.highlighted,
        sort_order: product.sort_order,
        tier: product.tier,
        currency: product.currency,
        servers_permitted: product.servers_permitted,
      });
    }

    const group = groups.get(product.name)!;
    if (product.interval === "month") {
      group.monthly = product;
    } else if (product.interval === "year") {
      group.annual = product;
    }
  }

  return Array.from(groups.values()).sort((a, b) => a.sort_order - b.sort_order);
}

function formatMonthlyEquivalent(annualMinorUnits: number, currency: string): string {
  const monthlyMinorUnits = Math.round(annualMinorUnits / 12);
  return formatCurrency(monthlyMinorUnits, currency);
}

export default function Pricing() {
  const [products, setProducts] = useState<PolarProduct[]>([]);
  const [subscriptions, setSubscriptions] = useState<PolarSubscription[]>([]);
  const [billingInterval, setBillingInterval] = useState<"monthly" | "annual">("monthly");
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [showChangeModal, setShowChangeModal] = useState(false);
  const [pendingChange, setPendingChange] = useState<{
    subId: string;
    productId: string;
    productName: string;
  } | null>(null);
  const [affiliateCode, setAffiliateCode] = useState("");
  const [affiliateOpen, setAffiliateOpen] = useState(false);

  // Load saved affiliate referral code from localStorage (with 30-day expiry)
  useEffect(() => {
    const savedCode = localStorage.getItem("affiliate_ref");
    const savedAt = localStorage.getItem("affiliate_ref_at");
    if (savedCode && savedAt) {
      const ageMs = Date.now() - new Date(savedAt).getTime();
      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
      if (ageMs < thirtyDaysMs) {
        setAffiliateCode(savedCode);
        setAffiliateOpen(true);
      } else {
        // Expired - clean up
        localStorage.removeItem("affiliate_ref");
        localStorage.removeItem("affiliate_ref_at");
      }
    }
  }, []);

  const loadData = useCallback(async () => {
    try {
      const [productsRes, subsRes] = await Promise.all([
        apiClient.premium.getProducts(),
        apiClient.premium.getSubscriptions(),
      ]);
      setProducts(productsRes.data);
      setSubscriptions(subsRes.data);
    } catch {
      // Interceptor handles error display
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const activeSub = subscriptions.find((s) => s.status === "active" || s.status === "canceled");

  const groups = groupProducts(products);

  const handleCheckout = async (polarProductId: string) => {
    setCheckoutLoading(polarProductId);
    try {
      const code = affiliateCode.trim() || undefined;
      const res = await apiClient.premium.checkout(polarProductId, code);
      window.location.href = res.data.checkout_url;
    } catch {
      // Interceptor handles error display
    } finally {
      setCheckoutLoading(null);
    }
  };

  const confirmChangePlan = (subId: string, productId: string, productName: string) => {
    setPendingChange({ subId, productId, productName });
    setShowChangeModal(true);
  };

  const handleChangePlan = async () => {
    if (!pendingChange) return;
    try {
      await apiClient.premium.changeSubscription(pendingChange.subId, pendingChange.productId);
      toast.success("Subscription updated successfully.");
      await loadData();
    } catch {
      // Interceptor handles error display
    } finally {
      setShowChangeModal(false);
      setPendingChange(null);
    }
  };

  if (loading) {
    return (
      <MainLayout title="">
        <div
          className="flex items-center justify-center min-h-50"
          role="status"
          aria-label="Loading pricing plans"
        >
          <div
            className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"
            aria-hidden="true"
          ></div>
          <span className="sr-only">Loading pricing plans...</span>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout title="">
      <div className="space-y-4">
        {/* Title */}
        <div className="text-center">
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2">Choose Your Plan</h1>
          <p className="text-gray-400">Select the perfect plan for your needs</p>
        </div>

        {/* Billing interval toggle */}
        <div
          className={`flex items-center justify-center gap-2 ${billingInterval == "annual" ? "mb-2" : ""}`}
        >
          <div
            className="inline-flex bg-gray-800 rounded-full p-1"
            role="radiogroup"
            aria-label="Billing interval"
          >
            <Button
              type="button"
              role="radio"
              aria-checked={billingInterval === "monthly"}
              onClick={() => setBillingInterval("monthly")}
              className={`px-5 py-2 rounded-full font-medium text-sm transition-colors ${
                billingInterval === "monthly"
                  ? "bg-blue-500 text-white"
                  : "text-gray-300 hover:text-white"
              }`}
            >
              Monthly
            </Button>
            <Button
              type="button"
              role="radio"
              aria-checked={billingInterval === "annual"}
              onClick={() => setBillingInterval("annual")}
              className={`px-5 py-2 rounded-full font-medium text-sm transition-colors ${
                billingInterval === "annual"
                  ? "bg-blue-500 text-white"
                  : "text-gray-300 hover:text-white"
              }`}
            >
              Annual
            </Button>
          </div>
        </div>
        {billingInterval === "annual" && (
          <div className="flex items-center justify-center gap-2">
            <span className="bg-green-900/50 text-green-400 text-xs font-medium px-2.5 py-1 rounded-full">
              Save up to 17%
            </span>
          </div>
        )}

        {/* Affiliate code */}
        <div className="max-w-md mx-auto w-full">
          <Button
            variant="ghost"
            onClick={() => setAffiliateOpen(!affiliateOpen)}
            className="flex items-center gap-2 text-sm text-gray-400 hover:text-white mx-auto"
          >
            Have an affiliate code?
            <FontAwesomeIcon
              icon={affiliateOpen ? faChevronUp : faChevronDown}
              className="text-xs"
              aria-hidden="true"
            />
          </Button>
          {affiliateOpen && (
            <div className="mt-3">
              <TextInput
                value={affiliateCode}
                onChange={setAffiliateCode}
                placeholder="Enter affiliate code"
              />
              {affiliateCode.trim() && (
                <p className="text-xs text-green-400 mt-1">
                  Affiliate code will be applied at checkout
                </p>
              )}
            </div>
          )}
        </div>

        {/* Pricing cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {groups.map((group) => {
            const product = billingInterval === "monthly" ? group.monthly : group.annual;

            if (!product) return null;

            const price =
              billingInterval === "monthly"
                ? formatCurrency(product.price, group.currency)
                : formatMonthlyEquivalent(product.price, group.currency);

            const isCurrentPlan =
              activeSub && activeSub.polar_product_id === product.polar_product_id;

            return (
              <div
                key={product.id}
                className={`bg-gray-800/50 rounded-2xl p-6 flex flex-col relative ${
                  group.highlighted ? "border-2 border-blue-500" : "border border-gray-700"
                }`}
              >
                {group.highlighted && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-500 text-white text-xs px-3 py-1 rounded-full font-medium whitespace-nowrap">
                    Most Popular
                  </span>
                )}

                <h3 className="text-xl font-bold text-white">{group.name}</h3>
                <p className="text-gray-400 text-sm mt-1">{group.description}</p>

                <div className="mt-4 mb-6">
                  <span className="text-3xl font-bold text-white">{price}</span>
                  <span className="text-gray-400 text-sm">/month</span>
                  {billingInterval === "annual" && group.monthly && (
                    <div className="mt-1">
                      <span className="text-gray-500 line-through text-sm">
                        {formatCurrency(group.monthly.price, group.currency)}/mo
                      </span>
                      <span className="text-gray-400 text-sm ml-2">
                        billed yearly at {formatCurrency(product.price, group.currency)}
                      </span>
                    </div>
                  )}
                  {billingInterval === "monthly" && group.annual && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setBillingInterval("annual")}
                      className="mt-1 text-sm p-0"
                    >
                      Switch to annual and pay{" "}
                      {formatMonthlyEquivalent(group.annual.price, group.currency)}/mo
                    </Button>
                  )}
                </div>

                <ul className="space-y-2 flex-1 mb-6">
                  {group.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm">
                      <span className="text-green-400 mt-0.5" aria-hidden="true">
                        &#10003;
                      </span>
                      <span className="text-gray-300">{feature}</span>
                    </li>
                  ))}
                </ul>

                <Button
                  variant={isCurrentPlan ? "secondary" : activeSub ? "outline" : "primary"}
                  onClick={() => {
                    if (isCurrentPlan) return;
                    if (activeSub && activeSub.status === "active") {
                      confirmChangePlan(
                        activeSub.polar_subscription_id,
                        product.polar_product_id,
                        group.name,
                      );
                    } else {
                      handleCheckout(product.polar_product_id);
                    }
                  }}
                  disabled={!!isCurrentPlan || checkoutLoading === product.polar_product_id}
                  className={`w-full py-2.5 rounded-lg font-medium ${
                    isCurrentPlan
                      ? "bg-gray-600 text-gray-400"
                      : activeSub
                        ? "border-blue-500 text-blue-400 hover:bg-blue-500/10"
                        : "bg-blue-500 hover:bg-blue-600"
                  }`}
                  title={
                    isCurrentPlan
                      ? `Current plan: ${group.name}`
                      : activeSub
                        ? `Switch to ${group.name}`
                        : `Subscribe to ${group.name}`
                  }
                >
                  {checkoutLoading === product.polar_product_id
                    ? "Redirecting..."
                    : isCurrentPlan
                      ? "Current Plan"
                      : activeSub
                        ? "Switch to this plan"
                        : "Subscribe"}
                </Button>
              </div>
            );
          })}
        </div>
        <div className="flex items-center justify-center gap-2">
          <span className="text-xs italic text-gray-300">
            Local taxes/fees will be applied at checkout
          </span>
        </div>
      </div>

      {/* Plan change confirmation modal */}
      <ConfirmModal
        isOpen={showChangeModal}
        title="Change Subscription"
        message={
          <div className="space-y-3">
            <p>
              You are about to switch to <strong>{pendingChange?.productName}</strong>.
            </p>
            <p>
              Your payment method will be charged a prorated amount for the remainder of your
              current billing period. The new plan takes effect immediately.
            </p>
            <p className="text-amber-400 text-sm">
              By confirming, you authorise the charge to your payment method on file.
            </p>
          </div>
        }
        confirmText="Confirm Change"
        cancelText="Keep Current Plan"
        confirmVariant="primary"
        onConfirm={handleChangePlan}
        onCancel={() => {
          setShowChangeModal(false);
          setPendingChange(null);
        }}
      />
    </MainLayout>
  );
}
