import type { FC } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faExclamationTriangle } from "@fortawesome/free-solid-svg-icons";

interface Props {
  /**
   * DOM id for the live region, also passed to the save button's
   * aria-describedby. Convention: "<feature>-lock-banner", e.g.
   * "panel-lock-banner", "form-lock-banner".
   */
  id: string;
  /** Undefined while loading, matching useFeatureLock's contract. */
  locked: boolean | undefined;
  /** Plural noun phrase ending in "changes", e.g. "Panel changes". */
  featureLabel: string;
  /** Plural noun for the body sentence, e.g. "panels". */
  existingLabel: string;
}

/**
 * Announces a FEATURE_* kill switch being off. Always mounts the same element,
 * whether loading, unlocked, or locked, so a screen reader picks up the
 * `aria-live` region reliably: an element that appears at the same time as its
 * content is not guaranteed to be announced by every screen reader/browser
 * combination. Only the transition from empty to populated is announced, which
 * happens exactly once, on a genuine lock.
 */
const FeatureLockBanner: FC<Props> = ({ id, locked, featureLabel, existingLabel }) => {
  return (
    <div
      id={id}
      role="status"
      aria-live="polite"
      className={
        locked ? "rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 mb-6" : undefined
      }
    >
      {locked && (
        <div className="flex items-start gap-3">
          <FontAwesomeIcon
            icon={faExclamationTriangle}
            className="mt-0.5 h-4 w-4 shrink-0 text-amber-400"
            aria-hidden="true"
          />
          <div>
            <p className="text-sm font-medium text-amber-200">
              {featureLabel} are temporarily unavailable
            </p>
            <p className="text-sm text-amber-300/80 mt-1">
              Your existing {existingLabel} are unchanged and nothing here will be saved until this
              is switched back on. Please check back later.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default FeatureLockBanner;
