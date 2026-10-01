import { useQuery } from "@tanstack/react-query";

import { apiClient } from "@/lib/api";
import { SERVER_LIST_INVITE_FLAG } from "@/lib/feature-flags";
import { useAuthStore } from "@/stores/auth";
import { useFeatureFlagValue } from "@/hooks/useFeatureFlag";
import type { InvitableGuild } from "@/types";

export type ServerListInviteVariant = "off" | "toolbar" | "per_server" | "both";

const VARIANTS: readonly ServerListInviteVariant[] = ["off", "toolbar", "per_server", "both"];

/**
 * Undefined while flags load. A bare `true` means GrowthBook is not configured
 * (self-hosted), where every flag reads as on, so it maps to the full experience.
 */
export function useServerListInviteVariant(): ServerListInviteVariant | undefined {
  const { value, isLoading } = useFeatureFlagValue(SERVER_LIST_INVITE_FLAG);
  if (isLoading) return undefined;
  if (value === true) return "both";
  if (typeof value === "string" && (VARIANTS as readonly string[]).includes(value)) {
    return value as ServerListInviteVariant;
  }
  return "off";
}

export function showsToolbarInvite(variant: ServerListInviteVariant | undefined): boolean {
  return variant === "toolbar" || variant === "both";
}

export function showsPerServerInvite(variant: ServerListInviteVariant | undefined): boolean {
  return variant === "per_server" || variant === "both";
}

export const invitableGuildsKey = ["invitableGuilds"] as const;

export function useInvitableGuilds(enabled: boolean) {
  const token = useAuthStore((state) => (state.isAuthenticated ? state.accessToken : null));

  return useQuery<InvitableGuild[]>({
    queryKey: [...invitableGuildsKey, token || ""],
    queryFn: () => apiClient.guilds.invitable().then((res) => res.data.guilds ?? []),
    enabled: enabled && !!token,
    staleTime: 60_000,
  });
}
