import { useQuery } from "@tanstack/react-query";

import { apiClient } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";

export type FeatureFlagValues = Record<string, unknown>;

// Query keys: keyed by token so the endpoint is never called before login and a
// second user signing in to the same tab does not inherit the first user's flag
// values. Guild-scoped reads are additionally keyed by guildId, so switching
// guilds within a session refetches instead of reusing a stale guild's flags.
const featureFlagKeys = {
  global: (token: string) => ["featureFlags", "global", token] as const,
  guild: (token: string, guildId: string) => ["featureFlags", "guild", token, guildId] as const,
};

interface FlagState {
  /** Undefined only while loading, so callers can avoid flashing a fallback. */
  enabled: boolean | undefined;
  isLoading: boolean;
}

/**
 * Reads one boolean flag, evaluated server-side so targeting rules and the rest of
 * the flag set never reach the browser. Only keys on the API's allowlist are
 * returned.
 *
 * Pass `guildId` from a guild-scoped page so "Specific servers"/"Percentage of
 * servers"/"Premium servers" targeting rules can match; without it, only
 * account-wide rules (staff, percentage of dashboard users, environment toggle)
 * can ever fire.
 *
 * While loading, `enabled` is undefined: render a skeleton or nothing rather than
 * treating it as false, otherwise gated UI flashes its fallback. Once loaded, or
 * when nobody is signed in, the flag reads as off.
 *
 * Pass `options.poll` for a flag that can change from under the user mid-session
 * (a kill switch someone else disables during an incident). The query already
 * has a 60s staleTime, so a 60s refetchInterval fires exactly when it goes stale.
 */
export function useFeatureFlag(
  key: string,
  guildId?: string,
  options?: { poll?: boolean },
): FlagState {
  // Read reactively rather than through getState(), so the flags load as soon as
  // login completes instead of staying stuck at their pre-auth value.
  const token = useAuthStore((state) => (state.isAuthenticated ? state.accessToken : null));

  // The persisted token is not available until rehydration finishes, during which
  // isAuthenticated is still false. Treating that as "signed out" would redirect a
  // hard reload of a gated page before the token arrived.
  const isAuthLoading = useAuthStore((state) => state.isLoading);

  const {
    data: values,
    isLoading: isQueryLoading,
    isError,
  } = useQuery<FeatureFlagValues>({
    queryKey: guildId
      ? featureFlagKeys.guild(token || "", guildId)
      : featureFlagKeys.global(token || ""),
    queryFn: () =>
      (guildId ? apiClient.user.guildFeatureFlags(guildId) : apiClient.user.featureFlags()).then(
        (res) => res.data,
      ),
    enabled: !!token,
    staleTime: 60_000,
    retry: 2,
    ...(options?.poll ? { refetchInterval: 60_000 } : {}),
  });

  if (isAuthLoading) {
    return { enabled: undefined, isLoading: true };
  }

  if (!token) {
    // Nobody signed in, so nothing gated should render. Reported as loaded rather
    // than loading, otherwise a route gate would hang on a null render forever.
    return { enabled: false, isLoading: false };
  }

  if (isError) {
    // Failing closed is the safe default: an unreachable API must not expose a
    // feature meant to be off. Not cached as success, so the next mount retries.
    return { enabled: false, isLoading: false };
  }

  if (isQueryLoading || values === undefined) {
    return { enabled: undefined, isLoading: true };
  }

  return { enabled: values[key] === true, isLoading: false };
}
