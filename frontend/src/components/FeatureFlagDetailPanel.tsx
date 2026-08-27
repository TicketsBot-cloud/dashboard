import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUpRightFromSquare } from "@fortawesome/free-solid-svg-icons";

import Button from "@/components/Button";
import Collapsible from "@/components/Collapsible";
import FeatureFlagRuleEditor from "@/components/FeatureFlagRuleEditor";
import Slider from "@/components/Slider";
import TagBadge from "@/components/TagBadge";
import { GROWTHBOOK_URL } from "@/lib/constants";
import type { FeatureFlag, FeatureFlagRule } from "@/types";

export type EnvironmentTone = "off" | "rules" | "all" | "attention";

export interface EnvironmentStatus {
  text: string;
  needsAttention: boolean;
  tone: EnvironmentTone;
}

interface FeatureFlagDetailPanelProps {
  flag: FeatureFlag;
  /** Environment names in display order, from `orderEnvironments`. */
  environmentOrder: string[];
  /** Unsaved rule edits, keyed by `draftKeyFor(environment)`. Owned by the caller. */
  drafts: Record<string, FeatureFlagRule[]>;
  busyKey: string | null;
  /** True for anyone below owner tier: view the flag, but disable every control that changes it. */
  readOnly: boolean;
  describeEnvironment: (
    flag: FeatureFlag,
    enabled: boolean,
    rules: FeatureFlagRule[],
  ) => EnvironmentStatus;
  draftKeyFor: (environment: string) => string;
  onToggle: (environment: string, next: boolean) => void;
  onRulesChange: (draftKey: string, rules: FeatureFlagRule[]) => void;
  onSaveRules: (environment: string) => void;
  onDiscardDraft: (draftKey: string) => void;
  headingId?: string;
}

/**
 * The per-flag detail body: description, per-environment enable toggle and
 * rules, and the GrowthBook link. Hosted inside `SlideOver`. The `drafts` and
 * `busyKey` state stays owned by the caller (the flags page) so closing this
 * panel never silently discards a half-typed rule edit.
 */
export default function FeatureFlagDetailPanel({
  flag,
  environmentOrder,
  drafts,
  busyKey,
  readOnly,
  describeEnvironment,
  draftKeyFor,
  onToggle,
  onRulesChange,
  onSaveRules,
  onDiscardDraft,
  headingId,
}: FeatureFlagDetailPanelProps) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 id={headingId} className="font-mono text-sm text-white break-all">
          {flag.key}
        </h2>
        {flag.description && <p className="text-gray-400 text-sm mt-1">{flag.description}</p>}
        <p className="text-gray-500 text-xs mt-2">
          {flag.value_type} · default{" "}
          <span className="font-mono">{flag.default_value || "unset"}</span>
        </p>
        <p className="text-gray-500 text-xs mt-1">
          Owner: {flag.owner_name || flag.owner || "Unassigned"}
        </p>
        {flag.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {flag.tags.map((tag) => (
              <TagBadge key={tag} label={tag} />
            ))}
          </div>
        )}

        <a
          href={`${GROWTHBOOK_URL}/features/${encodeURIComponent(flag.key)}`}
          target="_blank"
          rel="noreferrer"
          className="inline-block text-sm text-blue-400 hover:text-blue-300 mt-3"
        >
          Open in GrowthBook
          <FontAwesomeIcon icon={faUpRightFromSquare} className="ml-2 text-xs" aria-hidden="true" />
          <span className="sr-only"> for {flag.key}, opens in a new tab</span>
        </a>
      </div>

      <div className="flex flex-col gap-3">
        {environmentOrder.map((name) => {
          const environment = flag.environments[name];
          const key = draftKeyFor(name);
          const draft = drafts[key];
          const rules = draft ?? environment.rules;
          const isDirty =
            draft !== undefined && JSON.stringify(draft) !== JSON.stringify(environment.rules);
          const isBusy = busyKey === key;
          const status = describeEnvironment(flag, environment.enabled, rules);

          return (
            <div key={name} className="bg-gray-900/50 rounded-lg px-3 py-3">
              <div className="flex items-center gap-3 mb-2">
                <Slider
                  value={environment.enabled}
                  onChange={(next) => onToggle(name, next)}
                  disabled={isBusy || readOnly}
                  ariaLabel={`${environment.enabled ? "Disable" : "Enable"} ${flag.key} in ${name}`}
                />
                <span className="text-sm text-gray-300">{name}</span>
                <span
                  className={`text-xs ml-auto ${status.needsAttention ? "text-amber-400" : "text-gray-500"}`}
                >
                  {status.text}
                </span>
              </div>

              <Collapsible title={`Rules for ${name}`}>
                <FeatureFlagRuleEditor
                  rules={rules}
                  valueType={flag.value_type}
                  disabled={isBusy || readOnly}
                  onChange={(next) => onRulesChange(key, next)}
                />

                {isDirty && !readOnly && (
                  <div className="flex flex-wrap items-center gap-2 mt-3">
                    <Button onClick={() => onSaveRules(name)} disabled={isBusy}>
                      {isBusy ? "Saving..." : "Save rules"}
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => onDiscardDraft(key)}
                      disabled={isBusy}
                    >
                      Discard changes
                    </Button>
                    <p className="text-xs text-amber-400">Unsaved changes to {name}.</p>
                  </div>
                )}
              </Collapsible>
            </div>
          );
        })}
      </div>
    </div>
  );
}
