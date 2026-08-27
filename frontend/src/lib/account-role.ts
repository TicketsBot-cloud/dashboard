import type { AdminTier, LegacyEntitlement, UserEntitlement } from "@/types";
import { getAdminTierLabel } from "@/lib/admin-tier";
import { getPrimarySubscriptionLabel } from "@/lib/entitlement-tier";

const REGULAR_ACCOUNT_ROLE_LABEL = "Regular";

/** Sidebar account subtitle: staff `admin_tier`, else primary subscription, else Regular. */
export function getAccountRoleLabel(
  adminTier: AdminTier,
  entitlements: readonly UserEntitlement[],
  legacyEntitlement: LegacyEntitlement | null,
): string {
  const adminLabel = getAdminTierLabel(adminTier);
  if (adminLabel) return adminLabel;

  const subscriptionLabel = getPrimarySubscriptionLabel(entitlements, legacyEntitlement);
  if (subscriptionLabel) return subscriptionLabel;

  return REGULAR_ACCOUNT_ROLE_LABEL;
}
