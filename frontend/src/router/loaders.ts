import type { LoaderFunction } from "react-router";

import { isAtLeast } from "@/lib/admin-tier";
import { useAuthStore } from "@/stores/auth";
import { useEntitlementsStore } from "@/stores/entitlements";
import type { AdminTier, EntitlementTier } from "@/types";

const notFound = () => {
  throw new Response(null, { status: 404 });
};

export const requireEntitlement =
  (tier: EntitlementTier): LoaderFunction =>
  async () => {
    const { accessToken } = useAuthStore.getState();
    if (!accessToken) return null;
    const store = useEntitlementsStore.getState();
    if (!store.loaded) await store.fetch();
    if (!useEntitlementsStore.getState().hasEntitlementTier(tier)) notFound();
    return null;
  };

export const requireAdminTier =
  (minTier: AdminTier): LoaderFunction =>
  () => {
    const user = useAuthStore.getState().user;
    if (!user) return null;
    if (!isAtLeast(user.admin_tier, minTier)) notFound();
    return null;
  };
