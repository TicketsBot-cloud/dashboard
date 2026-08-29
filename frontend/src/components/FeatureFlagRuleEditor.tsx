import { useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowDown, faArrowUp, faPlus, faTrash } from "@fortawesome/free-solid-svg-icons";

import Button from "@/components/Button";
import Select from "@/components/Select";
import Slider from "@/components/Slider";
import Textarea from "@/components/Textarea";
import NumberInput from "@/components/NumberInput";
import TextInput from "@/components/TextInput";
import type { FeatureFlagRule, FeatureFlagRuleKind, FeatureFlagUnit } from "@/types";

/**
 * Rules are evaluated top to bottom and the first match wins, so order carries
 * meaning. The editor numbers them and offers explicit reordering rather than
 * presenting an unordered set.
 */
interface Props {
  rules: FeatureFlagRule[];
  valueType: string;
  onChange: (rules: FeatureFlagRule[]) => void;
  disabled?: boolean;
}

const KIND_LABELS: Record<FeatureFlagRuleKind, string> = {
  percentage: "Percentage of",
  guilds: "Specific servers",
  users: "Specific Discord users",
  dashboard_users: "Specific dashboard users",
  premium: "Premium servers",
  staff: "Bot staff",
  everyone: "Everyone",
  custom: "Custom",
};

/** "custom" is absent on purpose: the dashboard displays those but never writes one. */
const ADDABLE_KINDS: FeatureFlagRuleKind[] = [
  "percentage",
  "guilds",
  "users",
  "dashboard_users",
  "premium",
  "staff",
  "everyone",
];

const UNIT_OPTIONS: { key: FeatureFlagUnit; label: string }[] = [
  { key: "guild_id", label: "servers" },
  { key: "user_id", label: "Discord users" },
  { key: "dashboard_user_id", label: "dashboard users" },
];

const PREMIUM_OPTIONS = [
  { key: "0", label: "Premium or higher" },
  { key: "1", label: "Whitelabel only" },
];

const BOOLEAN_OPTIONS = [
  { key: "true", label: "on" },
  { key: "false", label: "off" },
];

const ID_LIST_KINDS: FeatureFlagRuleKind[] = ["guilds", "users", "dashboard_users"];

function idPlaceholder(kind: FeatureFlagRuleKind): string {
  switch (kind) {
    case "guilds":
      return "One server ID per line";
    case "users":
      return "One Discord user ID per line";
    default:
      return "One dashboard user ID per line";
  }
}

function defaultRuleFor(kind: FeatureFlagRuleKind, valueType: string): FeatureFlagRule {
  const value = valueType === "boolean" ? "true" : "";

  switch (kind) {
    case "percentage":
      return { kind, enabled: true, value, percentage: 10, unit: "guild_id" };
    case "guilds":
    case "users":
    case "dashboard_users":
      return { kind, enabled: true, value, ids: [] };
    case "premium":
      return { kind, enabled: true, value, min_premium_tier: 0 };
    default:
      return { kind, enabled: true, value };
  }
}

export default function FeatureFlagRuleEditor({ rules, valueType, onChange, disabled }: Props) {
  const [kindToAdd, setKindToAdd] = useState<FeatureFlagRuleKind>("percentage");

  const kindOptions = useMemo(
    () => ADDABLE_KINDS.map((kind) => ({ key: kind, label: KIND_LABELS[kind] })),
    [],
  );

  const update = (index: number, patch: Partial<FeatureFlagRule>) => {
    onChange(rules.map((rule, i) => (i === index ? { ...rule, ...patch } : rule)));
  };

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= rules.length) return;

    const next = [...rules];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  const add = () => onChange([...rules, defaultRuleFor(kindToAdd, valueType)]);

  return (
    <div className="flex flex-col gap-3">
      {rules.length === 0 && (
        <p className="text-gray-500 text-sm">
          No rules, so every evaluation gets the flag&apos;s default value.
        </p>
      )}

      <ol className="flex flex-col gap-3">
        {rules.map((rule, index) => (
          <li
            key={index}
            role="group"
            aria-label={`Rule ${index + 1} of ${rules.length}: ${KIND_LABELS[rule.kind]}`}
            className="bg-gray-900/60 rounded-lg p-3"
          >
            <div className="flex items-start justify-between gap-3 mb-2">
              <p className="text-sm text-white">
                <span className="text-gray-500 font-mono mr-2">{index + 1}</span>
                {KIND_LABELS[rule.kind]}
                {rule.kind === "custom" && (
                  <span className="text-gray-500 text-xs ml-2">read-only, edit in GrowthBook</span>
                )}
              </p>

              <div className="flex items-center gap-2 shrink-0">
                <Slider
                  value={rule.enabled}
                  onChange={(enabled) => update(index, { enabled })}
                  disabled={disabled}
                  ariaLabel={`${rule.enabled ? "Disable" : "Enable"} rule ${index + 1}`}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => move(index, -1)}
                  disabled={disabled || index === 0}
                  title={`Move rule ${index + 1} earlier`}
                >
                  <FontAwesomeIcon icon={faArrowUp} aria-hidden="true" />
                  <span className="sr-only">Move rule {index + 1} earlier</span>
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => move(index, 1)}
                  disabled={disabled || index === rules.length - 1}
                  title={`Move rule ${index + 1} later`}
                >
                  <FontAwesomeIcon icon={faArrowDown} aria-hidden="true" />
                  <span className="sr-only">Move rule {index + 1} later</span>
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onChange(rules.filter((_, i) => i !== index))}
                  disabled={disabled}
                  className="text-red-400 hover:text-red-300 hover:bg-red-900/30"
                  title={`Remove rule ${index + 1}`}
                >
                  <FontAwesomeIcon icon={faTrash} aria-hidden="true" />
                  <span className="sr-only">Remove rule {index + 1}</span>
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap items-end gap-3">
              {rule.kind === "percentage" && (
                <>
                  <div className="w-24">
                    <NumberInput
                      label="Percent"
                      value={rule.percentage ?? 0}
                      onChange={(percentage) => update(index, { percentage })}
                      min={0}
                      max={100}
                      disabled={disabled}
                    />
                  </div>
                  <div className="w-48">
                    <Select
                      label="Of"
                      value={rule.unit ?? "guild_id"}
                      options={UNIT_OPTIONS}
                      onChange={(unit) =>
                        update(index, { unit: (unit ?? "guild_id") as FeatureFlagUnit })
                      }
                      disabled={disabled}
                      hideSearch
                    />
                  </div>
                </>
              )}

              {rule.kind === "premium" && (
                <div className="w-56">
                  <Select
                    label="Tier"
                    value={String(rule.min_premium_tier ?? 0)}
                    options={PREMIUM_OPTIONS}
                    onChange={(tier) => update(index, { min_premium_tier: Number(tier ?? "0") })}
                    disabled={disabled}
                    hideSearch
                  />
                </div>
              )}

              <div className="w-32">
                {valueType === "boolean" ? (
                  <Select
                    label="Set to"
                    value={rule.value || "true"}
                    options={BOOLEAN_OPTIONS}
                    onChange={(value) => update(index, { value: value ?? "true" })}
                    disabled={disabled}
                    hideSearch
                  />
                ) : (
                  <TextInput
                    label="Set to"
                    value={rule.value}
                    onChange={(value) => update(index, { value })}
                    placeholder="Value"
                    disabled={disabled}
                  />
                )}
              </div>
            </div>

            {ID_LIST_KINDS.includes(rule.kind) && (
              <div className="mt-3">
                <Textarea
                  max={1000}
                  label={`IDs (${(rule.ids ?? []).length})`}
                  value={(rule.ids ?? []).join("\n")}
                  onChange={(value) =>
                    update(index, {
                      ids: value
                        .split(/[\s,]+/)
                        .map((id) => id.trim())
                        .filter(Boolean),
                    })
                  }
                  placeholder={idPlaceholder(rule.kind)}
                  disabled={disabled}
                />
              </div>
            )}

            {rule.kind === "custom" && (
              <p className="mt-2 text-xs text-gray-500 font-mono break-all">
                {rule.raw_condition || rule.summary}
              </p>
            )}
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap items-end gap-2">
        <div className="w-56">
          <Select
            label="Add a rule"
            value={kindToAdd}
            options={kindOptions}
            onChange={(kind) => setKindToAdd((kind ?? "percentage") as FeatureFlagRuleKind)}
            disabled={disabled}
            hideSearch
          />
        </div>
        <Button variant="secondary" onClick={add} disabled={disabled}>
          <FontAwesomeIcon icon={faPlus} className="mr-2" aria-hidden="true" />
          Add rule
        </Button>
      </div>
    </div>
  );
}
