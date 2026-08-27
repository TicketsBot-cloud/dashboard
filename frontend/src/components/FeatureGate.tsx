import type { ReactNode } from "react";

import { useFeatureFlag } from "@/hooks/useFeatureFlag";

interface Props {
  /** Flag key, e.g. 202608_NEW_PRICING_PAGE. */
  flag: string;
  children: ReactNode;
  /** Rendered when the flag is off. Nothing by default. */
  fallback?: ReactNode;
  /**
   * Rendered while flags are loading. Defaults to nothing, which avoids showing
   * the fallback and then swapping to the real content a moment later.
   */
  loading?: ReactNode;
  /**
   * Guild to evaluate the flag against, so "Specific servers"/"Percentage of
   * servers"/"Premium servers" targeting rules can match. Omit for guild-agnostic
   * gates (account-wide rules only).
   */
  guildId?: string;
}

/**
 * Renders children only when a flag is on.
 *
 * Fails closed: if the flags request fails, the flag reads as off. A gated feature
 * staying hidden is always safer than one appearing when it should not.
 */
export default function FeatureGate({
  flag,
  children,
  fallback = null,
  loading = null,
  guildId,
}: Props) {
  const { enabled, isLoading } = useFeatureFlag(flag, guildId);

  if (isLoading) return <>{loading}</>;

  return <>{enabled ? children : fallback}</>;
}
