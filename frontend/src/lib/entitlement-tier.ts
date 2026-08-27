import type { EntitlementTier, LegacyEntitlement, UserEntitlement } from "@/types";

function formatEntitlementTierLabel(tier: EntitlementTier): string {
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}

function isLegacyEntitlementActive(legacy: LegacyEntitlement | null): legacy is LegacyEntitlement {
  if (!legacy) return false;
  return new Date(legacy.expires_at) > new Date();
}

/** Highest-priority active subscription from modern entitlements. */
function getPrimaryEntitlement(entitlements: readonly UserEntitlement[]): UserEntitlement | null {
  if (entitlements.length === 0) return null;
  return [...entitlements].sort((a, b) => b.sku_priority - a.sku_priority)[0];
}

/** Maps legacy `tier_id` to `premium.PremiumTier` (0 = Premium, 1 = Whitelabel). */
function getLegacyTierLabel(tierId: number): string {
  if (tierId >= 1) return "Whitelabel";
  if (tierId === 0) return "Premium";
  return "Regular";
}

/** Display name for a subscription (plan label preferred over tier category). */
function getEntitlementDisplayLabel(entitlement: UserEntitlement | LegacyEntitlement): string {
  if ("sku_priority" in entitlement) {
    return entitlement.sku_label || formatEntitlementTierLabel(entitlement.tier);
  }
  return entitlement.sku_label || getLegacyTierLabel(entitlement.tier_id);
}

/**
 * Best active subscription label for the account subtitle.
 * Uses `sku_priority` from the API (same ordering as the backend), with legacy Patreon entitlements included.
 */
export function getPrimarySubscriptionLabel(
  entitlements: readonly UserEntitlement[],
  legacyEntitlement: LegacyEntitlement | null,
): string | null {
  const primary = getPrimaryEntitlement(entitlements);
  let bestLabel = primary ? getEntitlementDisplayLabel(primary) : null;
  let bestPriority = primary?.sku_priority ?? -1;

  if (isLegacyEntitlementActive(legacyEntitlement)) {
    const legacyPriority = legacyEntitlement.tier_id;
    if (legacyPriority > bestPriority) {
      bestPriority = legacyPriority;
      bestLabel = getEntitlementDisplayLabel(legacyEntitlement);
    }
  }

  return bestLabel;
}
