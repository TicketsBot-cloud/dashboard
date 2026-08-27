import { create } from "zustand";
import { apiClient } from "@/lib/api";
import { isActiveEntitlement } from "@/lib/entitlement-utils";
import { useAuthStore } from "@/stores/auth";
import type { EntitlementTier, LegacyEntitlement, UserEntitlement } from "@/types";

interface EntitlementsState {
  entitlements: UserEntitlement[];
  legacyEntitlement: LegacyEntitlement | null;
  loaded: boolean;
  error: boolean;
  fetch: () => Promise<void>;
  reset: () => void;
  hasEntitlementTier: (tier: EntitlementTier) => boolean;
  hasAnySubscription: () => boolean;
}

let activeFetchId = 0;

export const useEntitlementsStore = create<EntitlementsState>()((set, get) => ({
  entitlements: [],
  legacyEntitlement: null,
  loaded: false,
  error: false,

  fetch: async () => {
    if (get().loaded) return;
    const fetchId = ++activeFetchId;
    const initialAuth = useAuthStore.getState();
    const initialUserId = initialAuth.user?.id?.toString() ?? null;

    if (!initialAuth.isAuthenticated || !initialAuth.accessToken || !initialUserId) return;

    try {
      const res = await apiClient.premium.getEntitlements();
      const currentAuth = useAuthStore.getState();
      const currentUserId = currentAuth.user?.id?.toString() ?? null;

      if (
        fetchId !== activeFetchId ||
        !currentAuth.isAuthenticated ||
        currentAuth.accessToken !== initialAuth.accessToken ||
        currentUserId !== initialUserId
      ) {
        return;
      }

      set({
        entitlements: res.data.entitlements ?? [],
        legacyEntitlement: res.data.legacy_entitlement ?? null,
        loaded: true,
        error: false,
      });
    } catch {
      if (fetchId !== activeFetchId) return;
      set({ loaded: true, error: true });
    }
  },

  reset: () => {
    activeFetchId += 1;
    set({
      entitlements: [],
      legacyEntitlement: null,
      loaded: false,
      error: false,
    });
  },

  hasEntitlementTier: (tier) => {
    const { entitlements, legacyEntitlement } = get();
    if (entitlements.some((e) => isActiveEntitlement(e) && e.tier === tier)) return true;
    if (!legacyEntitlement) return false;
    if (new Date(legacyEntitlement.expires_at) <= new Date()) return false;
    if (tier === "whitelabel") return legacyEntitlement.tier_id >= 1;
    if (tier === "premium") return legacyEntitlement.tier_id === 0;
    return false;
  },

  hasAnySubscription: () => {
    const { entitlements, legacyEntitlement } = get();
    if (entitlements.some(isActiveEntitlement)) return true;
    if (!legacyEntitlement) return false;
    return new Date(legacyEntitlement.expires_at) > new Date();
  },
}));
