import { useFeatureFlag } from "@/hooks/useFeatureFlag";

interface FeatureLockState {
  /** Undefined only while loading, so callers can avoid flashing a fallback. */
  locked: boolean | undefined;
  isLoading: boolean;
}

/**
 * Thin wrapper over useFeatureFlag for FEATURE_* kill switches, where on means
 * available and off means locked down. Polls every 60s so a flag disabled
 * mid-incident by someone else locks the page without a reload.
 *
 * Only a confirmed "off" locks the UI, not "still loading": `locked` stays
 * undefined while the flag is loading, matching useFeatureFlag's contract.
 *
 * The page is still responsible for forcing this true the instant a 503 lands
 * mid-session, since the polled value will not reflect that until the next tick.
 */
export function useFeatureLock(flagKey: string, guildId?: string): FeatureLockState {
  const { enabled, isLoading } = useFeatureFlag(flagKey, guildId, { poll: true });

  return {
    locked: isLoading ? undefined : enabled === false,
    isLoading,
  };
}
