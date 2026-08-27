import type { AdminTier } from "@/types";

const TIER_RANK: Record<AdminTier, number> = {
  "": 0,
  helper: 1,
  admin: 2,
  owner: 3,
};

const ADMIN_TIER_LABELS: Record<Exclude<AdminTier, "">, string> = {
  helper: "Helper",
  admin: "Admin",
  owner: "Owner",
};

export function isAtLeast(userTier: AdminTier, requiredTier: AdminTier): boolean {
  return TIER_RANK[userTier] >= TIER_RANK[requiredTier];
}

export function isAnyAdmin(tier: AdminTier): boolean {
  return isAtLeast(tier, "helper");
}

export function getAdminTierLabel(tier: AdminTier): string | null {
  if (tier === "helper" || tier === "admin" || tier === "owner") {
    return ADMIN_TIER_LABELS[tier];
  }
  return null;
}
