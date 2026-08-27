import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faExclamationTriangle,
  faFlag,
  faLayerGroup,
  faPlus,
  faUpRightFromSquare,
} from "@fortawesome/free-solid-svg-icons";
import { toast } from "sonner";

import Button from "@/components/Button";
import EmptyState from "@/components/EmptyState";
import FeatureFlagDetailPanel, {
  type EnvironmentStatus,
} from "@/components/FeatureFlagDetailPanel";
import { HoverTooltip } from "@/components/HoverTooltip";
import SearchInput from "@/components/SearchInput";
import Select from "@/components/Select";
import SortableHeaderCell from "@/components/SortableHeaderCell";
import Table from "@/components/Table";
import TagBadge from "@/components/TagBadge";
import TextInput from "@/components/TextInput";
import Textarea from "@/components/Textarea";
import ConfirmModal from "@/components/modals/ConfirmModal";
import ActionModal from "@/components/modal-primitives/ActionModal";
import SlideOver from "@/components/modal-primitives/SlideOver";
import TableSkeleton from "@/components/skeletons/TableSkeleton";
import { useTableSort } from "@/hooks/useTableSort";
import { useUrlSearch } from "@/hooks/useUrlSearch";
import { apiClient } from "@/lib/api";
import { isAtLeast } from "@/lib/admin-tier";
import { GROWTHBOOK_URL } from "@/lib/constants";
import { matchesSearch } from "@/lib/search";
import { toTime, type SortColumn } from "@/lib/table-sort";
import { useAuthStore } from "@/stores/auth";
import type { FeatureFlag, FeatureFlagExperiment, FeatureFlagRule } from "@/types";

/** Production first, then alphabetical: it is the environment that matters most. */
function orderEnvironments(names: string[]): string[] {
  return [...names].sort((a, b) => {
    if (a === "production") return -1;
    if (b === "production") return 1;
    return a.localeCompare(b);
  });
}

function draftKey(flagKey: string, environment: string) {
  return `${flagKey}:${environment}`;
}

/** Flag keys follow YYYYMM_SHORT_DESC so they sort by the month they landed. */
function currentMonthPrefix(): string {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}_`;
}

const FLAG_KEY_PATTERN = /^\d{6}_[A-Z0-9]+(_[A-Z0-9]+)*$/;

const VALUE_TYPE_OPTIONS = [
  { key: "boolean", label: "On/off" },
  { key: "string", label: "Text" },
  { key: "number", label: "Number" },
  { key: "json", label: "JSON" },
];

const DEFAULT_VALUE_FOR: Record<string, string> = {
  boolean: "false",
  string: "",
  number: "0",
  json: "{}",
};

interface PendingEnable {
  flagKey: string;
  environment: string;
}

// "rules" means the environment is enabled and evaluates targeting rules, not
// that it is live for everyone: a percentage rollout or a guild/user allowlist
// both land here. Orange reflects that this is a partial, in-progress rollout
// rather than the fully-shipped "all" state.
const TONE_DOT_CLASS: Record<EnvironmentStatus["tone"], string> = {
  off: "bg-gray-400",
  rules: "bg-orange-500",
  all: "bg-green-500",
  attention: "bg-amber-400",
};

/**
 * States the outcome rather than the configuration.
 *
 * The environment toggle is not an on switch: enabled means "evaluate the rules,
 * then fall back to the default". An enabled environment with no rules and a
 * default of false therefore serves false, which reads as the flag being broken
 * unless the UI says so plainly.
 *
 * A single enabled "everyone" rule is the same outcome as no rules at all: it
 * matches all traffic unconditionally, so the environment is fully live, not
 * partially rolled out. Any other rule shape (percentage, an allowlist, more
 * than one rule) is genuinely conditional, so it stays the "rules" tone.
 */
function describeEnvironment(
  flag: FeatureFlag,
  enabled: boolean,
  rules: FeatureFlagRule[],
): EnvironmentStatus {
  if (!enabled) {
    return { text: "off, nothing is evaluated", needsAttention: false, tone: "off" };
  }

  const fallback = flag.default_value || "unset";

  if (rules.length === 1 && rules[0].kind === "everyone" && rules[0].enabled) {
    const value = rules[0].value || fallback;
    return { text: `everyone gets ${value}`, needsAttention: false, tone: "all" };
  }

  if (rules.length > 0) {
    return {
      text: `${rules.length} rule${rules.length === 1 ? "" : "s"}`,
      needsAttention: false,
      tone: "rules",
    };
  }

  if (flag.value_type === "boolean" && flag.default_value !== "true") {
    return { text: "no rules, so everyone gets false", needsAttention: true, tone: "attention" };
  }

  return { text: `no rules, so everyone gets ${fallback}`, needsAttention: false, tone: "all" };
}

/** Resolved owner name, falling back to the raw ID/string GrowthBook holds. */
function ownerDisplay(flag: FeatureFlag): string {
  return flag.owner_name || flag.owner || "Unassigned";
}

function flagNeedsAttention(flag: FeatureFlag): boolean {
  return Object.values(flag.environments).some(
    (environment) =>
      describeEnvironment(flag, environment.enabled, environment.rules).needsAttention,
  );
}

/** True if any of this flag's environments has an unsaved, actually-changed rule edit. */
function flagHasDirtyDraft(flag: FeatureFlag, drafts: Record<string, FeatureFlagRule[]>): boolean {
  return Object.keys(flag.environments).some((name) => {
    const draft = drafts[draftKey(flag.key, name)];
    if (draft === undefined) return false;
    return JSON.stringify(draft) !== JSON.stringify(flag.environments[name].rules);
  });
}

/** Condensed environment line for the mobile card, e.g. "2 live · 1 attention · 1 off". */
function environmentSummary(flag: FeatureFlag): string {
  let live = 0;
  let attention = 0;
  let off = 0;

  for (const environment of Object.values(flag.environments)) {
    const tone = describeEnvironment(flag, environment.enabled, environment.rules).tone;
    if (tone === "attention") attention += 1;
    else if (tone === "off") off += 1;
    else live += 1;
  }

  const parts: string[] = [];
  if (live > 0) parts.push(`${live} live`);
  if (attention > 0) parts.push(`${attention} attention`);
  if (off > 0) parts.push(`${off} off`);
  return parts.length > 0 ? parts.join(" · ") : "no environments";
}

function formatRelativeTime(iso: string): string {
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return "unknown";

  const diff = Date.now() - time;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  const rtf = new Intl.RelativeTimeFormat("en-GB", { numeric: "auto" });
  if (days > 0) return rtf.format(-days, "day");
  if (hours > 0) return rtf.format(-hours, "hour");
  if (minutes > 0) return rtf.format(-minutes, "minute");
  return rtf.format(-seconds, "second");
}

function formatFullTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type FlagSortKey = "key" | "owner" | "updated_at";

const FLAG_SORT_COLUMNS: Record<FlagSortKey, SortColumn<FeatureFlag>> = {
  key: { value: (f) => f.key, defaultDir: "asc" },
  owner: { value: (f) => ownerDisplay(f), defaultDir: "asc" },
  updated_at: { value: (f) => toTime(f.updated_at) },
};

interface FlagGroup {
  owner: string | null;
  flags: FeatureFlag[];
}

interface FlagRowProps {
  flag: FeatureFlag;
  environments: string[];
  needsAttention: boolean;
  hasDirtyDraft: boolean;
  onOpen: () => void;
}

function FlagRow({ flag, environments, needsAttention, hasDirtyDraft, onOpen }: FlagRowProps) {
  return (
    <Table.Row>
      <Table.Cell className="px-4 py-3">
        <button
          type="button"
          onClick={onOpen}
          className="inline-flex max-w-[220px] items-center gap-1.5 text-left font-mono text-xs text-white hover:text-blue-300"
          title={flag.key}
        >
          {needsAttention && (
            <FontAwesomeIcon
              icon={faExclamationTriangle}
              className="shrink-0 text-amber-400"
              aria-hidden="true"
            />
          )}
          <span className="truncate">{flag.key}</span>
          {hasDirtyDraft && (
            <span className="shrink-0 text-blue-400" aria-hidden="true">
              &bull;
            </span>
          )}
          {(needsAttention || hasDirtyDraft) && (
            <span className="sr-only">
              {needsAttention ? ", needs attention" : ""}
              {hasDirtyDraft ? ", has unsaved changes" : ""}
            </span>
          )}
        </button>
      </Table.Cell>
      <Table.Cell className="px-4 py-3 text-gray-300">{ownerDisplay(flag)}</Table.Cell>
      <Table.Cell className="px-4 py-3">
        <div className="flex flex-wrap gap-1">
          {flag.tags.slice(0, 2).map((tag) => (
            <TagBadge key={tag} label={tag} />
          ))}
          {flag.tags.length > 2 && (
            <span className="text-xs text-gray-500" title={flag.tags.slice(2).join(", ")}>
              +{flag.tags.length - 2}
            </span>
          )}
        </div>
      </Table.Cell>
      {environments.map((name) => {
        const environment = flag.environments[name];
        // The environment column set is global (every environment GrowthBook
        // knows about), but a given flag is not guaranteed to have an entry for
        // every one, e.g. one created before an environment existed.
        if (!environment) {
          return (
            <Table.Cell key={name} className="px-4 py-3">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full border border-dashed border-gray-400"
                title={`not configured for ${name}`}
                aria-hidden="true"
              />
              <span className="sr-only">not configured for {name}</span>
            </Table.Cell>
          );
        }

        const status = describeEnvironment(flag, environment.enabled, environment.rules);
        return (
          <Table.Cell key={name} className="px-4 py-3">
            <HoverTooltip label={status.text} placement="top" className="inline-flex">
              {/* `title` covers sighted keyboard/touch users, who cannot trigger
                  HoverTooltip's hover-only popover; `sr-only` covers screen readers,
                  who see the tooltip's own text regardless of hover state. */}
              <span
                className={`inline-block h-2.5 w-2.5 rounded-full ${TONE_DOT_CLASS[status.tone]}`}
                title={status.text}
                aria-hidden="true"
              />
              <span className="sr-only">{status.text}</span>
            </HoverTooltip>
          </Table.Cell>
        );
      })}
      <Table.Cell className="px-4 py-3 text-xs text-gray-400">
        <span title={formatFullTimestamp(flag.updated_at)}>
          {formatRelativeTime(flag.updated_at)}
        </span>
      </Table.Cell>
    </Table.Row>
  );
}

export default function FeatureFlagsPage() {
  const { user } = useAuthStore();
  // The page itself only requires admin tier (see router/routes/admin.tsx), so
  // it can be reached read-only. Every mutation, both the controls below and
  // the backend endpoints behind them, is gated to owner: a toggle here is
  // effectively a kill switch.
  const isOwner = isAtLeast(user?.admin_tier ?? "", "owner");

  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [environments, setEnvironments] = useState<string[]>([]);
  const [experiments, setExperiments] = useState<FeatureFlagExperiment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isConfigured, setIsConfigured] = useState(true);
  const [flagsDefaultOn, setFlagsDefaultOn] = useState(false);
  const [pendingEnable, setPendingEnable] = useState<PendingEnable | null>(null);
  const [reason, setReason] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const { searchQuery, setSearchQuery, debouncedSearch } = useUrlSearch();
  const [searchParams, setSearchParams] = useSearchParams();
  const [groupByOwner, setGroupByOwner] = useState(false);
  const [activeFlagKey, setActiveFlagKey] = useState<string | null>(null);

  // Unsaved rule edits, keyed by flag and environment. Kept out of `flags` so a
  // refetch cannot silently discard something half-typed, and out of the
  // detail panel so closing it never discards one either.
  const [drafts, setDrafts] = useState<Record<string, FeatureFlagRule[]>>({});

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newKey, setNewKey] = useState(currentMonthPrefix());
  const [newDescription, setNewDescription] = useState("");
  const [newValueType, setNewValueType] = useState("boolean");
  const [isCreating, setIsCreating] = useState(false);
  // Only meaningful for boolean flags; a FEATURE_* kill switch needs to be live
  // the instant it exists, or the feature it guards is broken for everyone until
  // someone remembers to flip it on.
  const [startEnabled, setStartEnabled] = useState(false);
  // Creating with startEnabled checked is an enable, so it goes through the same
  // confirm gate as the enable-toggle below rather than firing immediately.
  const [pendingCreate, setPendingCreate] = useState(false);

  useEffect(() => {
    if (newValueType !== "boolean") {
      setStartEnabled(false);
    }
  }, [newValueType]);

  const fetchAll = useCallback(async () => {
    try {
      const [flagsRes, experimentsRes] = await Promise.all([
        apiClient.admin.featureFlags.list(),
        apiClient.admin.featureFlags.experiments(),
      ]);
      setFlags(flagsRes.data.flags);
      setEnvironments(flagsRes.data.environments);
      setExperiments(experimentsRes.data);
      setIsConfigured(flagsRes.data.configured);
      setFlagsDefaultOn(flagsRes.data.flags_default_on);
    } catch {
      // Surfaced by the axios interceptor.
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const orderedEnvironments = useMemo(() => orderEnvironments(environments), [environments]);

  // Filter state (attention, owner) reads/writes straight to the URL so a link to
  // "flags that look broken right now" is shareable. `useUrlSearch` above is not
  // used for these: its debounce guard suits free text, not an instant toggle.
  const attentionOnly = searchParams.get("attention") === "1";
  const ownerFilter = searchParams.get("owner") ?? "all";

  const setAttentionOnly = useCallback(
    (next: boolean) => {
      setSearchParams(
        (previous) => {
          const params = new URLSearchParams(previous);
          if (next) params.set("attention", "1");
          else params.delete("attention");
          return params;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const setOwnerFilter = useCallback(
    (next: string) => {
      setSearchParams(
        (previous) => {
          const params = new URLSearchParams(previous);
          if (next && next !== "all") params.set("owner", next);
          else params.delete("owner");
          return params;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const ownerOptions = useMemo(() => {
    const names = new Set(flags.map(ownerDisplay));
    return [
      { key: "all", label: "All owners" },
      ...[...names].sort((a, b) => a.localeCompare(b)).map((name) => ({ key: name, label: name })),
    ];
  }, [flags]);

  const attentionCount = useMemo(() => flags.filter(flagNeedsAttention).length, [flags]);

  const filteredFlags = useMemo(
    () =>
      flags.filter((flag) => {
        if (!matchesSearch(debouncedSearch, flag.key, flag.description, ...flag.tags)) return false;
        if (attentionOnly && !flagNeedsAttention(flag)) return false;
        if (ownerFilter !== "all" && ownerDisplay(flag) !== ownerFilter) return false;
        return true;
      }),
    [flags, debouncedSearch, attentionOnly, ownerFilter],
  );

  const flagSort = useTableSort(filteredFlags, FLAG_SORT_COLUMNS, {
    initialSort: { key: "updated_at", dir: "desc" },
    persistKey: "admin-feature-flags",
  });

  // Sort stays live while grouped: the rows are sorted first, then partitioned
  // into owner buckets preserving that order, so each group ends up internally
  // sorted for free. "Unassigned" always sorts last.
  const groups = useMemo<FlagGroup[]>(() => {
    if (!groupByOwner) return [{ owner: null, flags: flagSort.sortedRows }];

    const buckets = new Map<string, FeatureFlag[]>();
    for (const flag of flagSort.sortedRows) {
      const owner = ownerDisplay(flag);
      const existing = buckets.get(owner);
      if (existing) existing.push(flag);
      else buckets.set(owner, [flag]);
    }

    const owners = [...buckets.keys()].sort((a, b) => {
      if (a === "Unassigned") return b === "Unassigned" ? 0 : 1;
      if (b === "Unassigned") return -1;
      return a.localeCompare(b);
    });

    return owners.map((owner) => ({ owner, flags: buckets.get(owner) ?? [] }));
  }, [groupByOwner, flagSort.sortedRows]);

  const activeFlag = useMemo(
    () => flags.find((flag) => flag.key === activeFlagKey) ?? null,
    [flags, activeFlagKey],
  );

  const applyToggle = useCallback(
    async (flagKey: string, environment: string, enabled: boolean, why?: string) => {
      setBusyKey(draftKey(flagKey, environment));
      try {
        await apiClient.admin.featureFlags.toggle(flagKey, environment, enabled, why);
        toast.success(
          enabled
            ? `Enabled ${flagKey} in ${environment}.`
            : `Disabled ${flagKey} in ${environment}.`,
        );
        await fetchAll();
      } catch {
        // Error handled by interceptor
      } finally {
        setBusyKey(null);
      }
    },
    [fetchAll],
  );

  const handleToggle = (flagKey: string, environment: string, next: boolean) => {
    // Asymmetric on purpose. Disabling is the recovery action, so it applies
    // immediately: a dialog in front of a kill switch costs time during exactly
    // the incident it exists for. Enabling is what exposes people to new
    // behaviour, so it confirms first and captures why.
    if (!next) {
      void applyToggle(flagKey, environment, false);
      return;
    }

    setReason("");
    setPendingEnable({ flagKey, environment });
  };

  const saveRules = async (flag: FeatureFlag, environment: string) => {
    const key = draftKey(flag.key, environment);
    const rules = drafts[key];
    if (!rules) return;

    setBusyKey(key);
    try {
      await apiClient.admin.featureFlags.updateRules(flag.key, environment, rules, flag.updated_at);
      toast.success(`Saved rules for ${flag.key} in ${environment}.`);
      setDrafts((previous) => {
        const next = { ...previous };
        delete next[key];
        return next;
      });
      await fetchAll();
    } catch (error) {
      const status = (error as { response?: { status?: number } })?.response?.status;
      if (status === 409) {
        // The interceptor shows the server's message; refresh so the next attempt
        // starts from current state rather than repeating the conflict.
        await fetchAll();
      }
    } finally {
      setBusyKey(null);
    }
  };

  const handleCreate = async () => {
    const key = newKey.trim();
    if (!FLAG_KEY_PATTERN.test(key)) {
      toast.error("Use the format 202608_SHORT_DESC: year and month, then uppercase words.");
      return;
    }

    setIsCreating(true);
    try {
      await apiClient.admin.featureFlags.create({
        key,
        description: newDescription.trim(),
        value_type: newValueType,
        default_value: DEFAULT_VALUE_FOR[newValueType] ?? "",
        start_enabled: startEnabled,
      });
      toast.success(
        startEnabled
          ? `Created ${key}. It is live in every environment now.`
          : `Created ${key}. It starts off in every environment.`,
      );
      setIsCreateOpen(false);
      setNewKey(currentMonthPrefix());
      setNewDescription("");
      setNewValueType("boolean");
      setStartEnabled(false);
      await fetchAll();
    } catch {
      // Error handled by interceptor
    } finally {
      setIsCreating(false);
    }
  };

  const handleCreateClick = () => {
    // Asymmetric on purpose, same as handleToggle: a flag that starts enabled is
    // live everywhere immediately, so it confirms first and captures why. A flag
    // that starts off, the normal case, creates immediately as it always has.
    if (startEnabled) {
      setPendingCreate(true);
      return;
    }

    void handleCreate();
  };

  if (isLoading) {
    return <TableSkeleton rows={4} columns={3} />;
  }

  if (!isConfigured) {
    return (
      <div>
        <header className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-semibold mb-2 text-center">Feature Flags</h1>
        </header>
        <EmptyState
          icon={faFlag}
          title="Feature flags are not configured"
          description={
            flagsDefaultOn ? (
              <>
                No GrowthBook is set up on this environment, so every feature is unlocked and
                nothing is gated.
                <span className="block mt-2">
                  Set GROWTHBOOK_API_HOST and GROWTHBOOK_CLIENT_KEY to start gating features, and
                  GROWTHBOOK_API_KEY to manage them from here.
                </span>
              </>
            ) : (
              "Set GROWTHBOOK_API_KEY on this environment to manage flags from here."
            )
          }
        />
      </div>
    );
  }

  return (
    <div>
      <header className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-semibold mb-2 text-center">Feature Flags</h1>
        <p className="text-center text-gray-400 text-sm sm:text-base">
          Turn features on and off, and choose who gets them, without a deploy. Changes reach
          running services within 30 seconds.
        </p>
      </header>

      {!isOwner && (
        <div
          role="status"
          className="rounded-lg border border-gray-600 bg-gray-800/60 px-4 py-3 mb-6 text-sm text-gray-300"
        >
          Read-only. Only owners can create flags, toggle environments, or edit rules.
        </div>
      )}

      <section aria-labelledby="flags-heading" className="mb-10">
        <div className="flex flex-col gap-3 mb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <h2 id="flags-heading" className="text-lg font-medium">
              Flags
            </h2>
            {isOwner && (
              <Button onClick={() => setIsCreateOpen(true)}>
                <FontAwesomeIcon icon={faPlus} className="mr-2" aria-hidden="true" />
                New flag
              </Button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <SearchInput
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="Search flags..."
              label="Search by flag key, description or tag"
              className="w-full sm:w-64"
            />
            <Button
              variant="ghost"
              onClick={() => setAttentionOnly(!attentionOnly)}
              aria-pressed={attentionOnly}
              className={attentionOnly ? "bg-amber-500/10 text-amber-300" : ""}
            >
              <FontAwesomeIcon icon={faExclamationTriangle} className="mr-2" aria-hidden="true" />
              Needs attention{attentionCount > 0 ? ` (${attentionCount})` : ""}
            </Button>
            <Select
              label="Owner"
              hideLabel
              value={ownerFilter}
              options={ownerOptions}
              onChange={(value) => setOwnerFilter(value ?? "all")}
              placeholder="All owners"
              className="w-full sm:w-48"
              hideSearch
            />
            <Button
              variant="ghost"
              onClick={() => setGroupByOwner((previous) => !previous)}
              aria-pressed={groupByOwner}
              className={groupByOwner ? "bg-gray-700 text-white" : ""}
            >
              <FontAwesomeIcon icon={faLayerGroup} className="mr-2" aria-hidden="true" />
              Group by owner
            </Button>
          </div>
        </div>

        {filteredFlags.length === 0 ? (
          <p className="text-gray-400 text-center py-8">
            {debouncedSearch
              ? `No flags found matching "${debouncedSearch}".`
              : attentionOnly || ownerFilter !== "all"
                ? "No flags match the current filters."
                : "No flags yet. Create one to get started."}
          </p>
        ) : (
          <>
            <div className="hidden md:block">
              <Table variant="compact" aria-label="Feature flags">
                <Table.Head>
                  <Table.Row>
                    <SortableHeaderCell sort={flagSort} sortKey="key" label="Key" />
                    <SortableHeaderCell sort={flagSort} sortKey="owner" label="Owner" />
                    <Table.HeaderCell>Tags</Table.HeaderCell>
                    {orderedEnvironments.map((name) => (
                      <Table.HeaderCell key={name}>{name}</Table.HeaderCell>
                    ))}
                    <SortableHeaderCell sort={flagSort} sortKey="updated_at" label="Updated" />
                  </Table.Row>
                </Table.Head>
                <Table.Body>
                  {groups.map((group) => (
                    <Fragment key={group.owner ?? "__flat"}>
                      {group.owner !== null && (
                        <Table.Row className="border-b border-gray-700">
                          <Table.Cell
                            colSpan={4 + orderedEnvironments.length}
                            className="bg-gray-800/60 px-4 py-2 text-xs uppercase tracking-wide text-gray-400"
                          >
                            {group.owner}{" "}
                            <span className="normal-case text-gray-500">
                              ({group.flags.length})
                            </span>
                          </Table.Cell>
                        </Table.Row>
                      )}
                      {group.flags.map((flag) => (
                        <FlagRow
                          key={flag.key}
                          flag={flag}
                          environments={orderedEnvironments}
                          needsAttention={flagNeedsAttention(flag)}
                          hasDirtyDraft={flagHasDirtyDraft(flag, drafts)}
                          onOpen={() => setActiveFlagKey(flag.key)}
                        />
                      ))}
                    </Fragment>
                  ))}
                </Table.Body>
              </Table>
            </div>

            <div className="md:hidden space-y-3">
              {groups.map((group) => (
                <Fragment key={group.owner ?? "__flat"}>
                  {group.owner !== null && (
                    <p className="px-1 text-xs uppercase tracking-wide text-gray-400">
                      {group.owner}{" "}
                      <span className="normal-case text-gray-500">({group.flags.length})</span>
                    </p>
                  )}
                  {group.flags.map((flag) => {
                    const needsAttention = flagNeedsAttention(flag);
                    const hasDirtyDraft = flagHasDirtyDraft(flag, drafts);
                    return (
                      <Button
                        key={flag.key}
                        type="button"
                        className="w-full block justify-start rounded-lg bg-gray-800 p-4 text-left"
                        onClick={() => setActiveFlagKey(flag.key)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex items-center gap-1.5">
                            {needsAttention && (
                              <FontAwesomeIcon
                                icon={faExclamationTriangle}
                                className="shrink-0 text-amber-400 text-xs"
                                aria-hidden="true"
                              />
                            )}
                            <span className="truncate font-mono text-sm text-white">
                              {flag.key}
                            </span>
                            {hasDirtyDraft && (
                              <span className="shrink-0 text-blue-400 text-xs" aria-hidden="true">
                                &bull;
                              </span>
                            )}
                            {(needsAttention || hasDirtyDraft) && (
                              <span className="sr-only">
                                {needsAttention ? ", needs attention" : ""}
                                {hasDirtyDraft ? ", has unsaved changes" : ""}
                              </span>
                            )}
                          </div>
                          <span className="shrink-0 text-xs text-gray-500">
                            {formatRelativeTime(flag.updated_at)}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-gray-400">{ownerDisplay(flag)}</p>
                        {flag.tags.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {flag.tags.slice(0, 2).map((tag) => (
                              <TagBadge key={tag} label={tag} />
                            ))}
                            {flag.tags.length > 2 && (
                              <span className="text-xs text-gray-500">+{flag.tags.length - 2}</span>
                            )}
                          </div>
                        )}
                        <p className="mt-2 text-xs text-gray-400">{environmentSummary(flag)}</p>
                      </Button>
                    );
                  })}
                </Fragment>
              ))}
            </div>
          </>
        )}
      </section>

      <section aria-labelledby="experiments-heading">
        <h2 id="experiments-heading" className="text-lg font-medium mb-4">
          Experiments
        </h2>

        {experiments.length === 0 ? (
          <p className="text-gray-400 text-center py-8">No running experiments.</p>
        ) : (
          <div
            className="grid gap-4 grid-cols-1 lg:grid-cols-2"
            role="list"
            aria-label="Experiments"
          >
            {experiments.map((experiment) => {
              const total = Object.values(experiment.exposed_units).reduce(
                (sum, count) => sum + count,
                0,
              );

              return (
                <article
                  key={experiment.id}
                  role="listitem"
                  className="bg-gray-800 rounded-xl p-4 sm:p-6"
                >
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="min-w-0">
                      <h3 className="text-white text-sm font-medium">{experiment.name}</h3>
                      <p className="font-mono text-xs text-gray-500 break-all mt-1">
                        {experiment.tracking_key}
                      </p>
                    </div>
                    <span className="text-xs text-gray-400 whitespace-nowrap">
                      {experiment.status}
                    </span>
                  </div>

                  <p className="text-xs text-gray-400 mb-3">Assigned on {experiment.assigned_on}</p>

                  {total === 0 ? (
                    <p className="text-xs text-amber-400">
                      No exposures recorded yet. Results cannot be computed until units are
                      enrolled.
                    </p>
                  ) : (
                    <ul className="text-xs text-gray-300 space-y-1">
                      {experiment.variations.map((variation, index) => (
                        <li key={variation.key || index} className="flex justify-between gap-4">
                          <span className="truncate">{variation.name || variation.key}</span>
                          <span className="font-mono text-gray-400">
                            {(experiment.exposed_units[String(index)] ?? 0).toLocaleString()}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}

                  <a
                    href={`${GROWTHBOOK_URL}/experiment/${encodeURIComponent(experiment.id)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-block text-sm text-blue-400 hover:text-blue-300 mt-3"
                  >
                    View results
                    <FontAwesomeIcon
                      icon={faUpRightFromSquare}
                      className="ml-2 text-xs"
                      aria-hidden="true"
                    />
                    <span className="sr-only">
                      {" "}
                      for {experiment.name} in GrowthBook, opens in a new tab
                    </span>
                  </a>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <SlideOver
        isOpen={activeFlag !== null}
        onClose={() => setActiveFlagKey(null)}
        ariaLabelledBy="flag-detail-heading"
        className="max-w-xl w-full"
        disableEscape={pendingEnable !== null || pendingCreate || isCreateOpen}
      >
        {activeFlag ? (
          <FeatureFlagDetailPanel
            flag={activeFlag}
            environmentOrder={orderEnvironments(Object.keys(activeFlag.environments))}
            drafts={drafts}
            busyKey={busyKey}
            readOnly={!isOwner}
            describeEnvironment={describeEnvironment}
            draftKeyFor={(environment) => draftKey(activeFlag.key, environment)}
            onToggle={(environment, next) => handleToggle(activeFlag.key, environment, next)}
            onRulesChange={(key, rules) => setDrafts((previous) => ({ ...previous, [key]: rules }))}
            onSaveRules={(environment) => void saveRules(activeFlag, environment)}
            onDiscardDraft={(key) =>
              setDrafts((previous) => {
                const next = { ...previous };
                delete next[key];
                return next;
              })
            }
            headingId="flag-detail-heading"
          />
        ) : null}
      </SlideOver>

      <ConfirmModal
        isOpen={pendingEnable !== null || pendingCreate}
        title={pendingCreate ? "Create and enable flag" : "Enable flag"}
        confirmText={pendingCreate ? "Create and enable" : "Enable"}
        confirmVariant={pendingCreate ? "danger" : "primary"}
        onConfirm={() => {
          if (pendingCreate) {
            setPendingCreate(false);
            void handleCreate();
            return;
          }
          if (!pendingEnable) return;
          const { flagKey, environment } = pendingEnable;
          const why = reason.trim() || undefined;
          setPendingEnable(null);
          void applyToggle(flagKey, environment, true, why);
        }}
        onCancel={() => {
          setPendingEnable(null);
          setPendingCreate(false);
        }}
        message={
          pendingCreate ? (
            <p>
              Create <span className="font-mono">{newKey.trim()}</span> already enabled in every
              environment? It goes live for everyone the moment it&apos;s created, not after a
              separate rollout step.
            </p>
          ) : (
            <div className="space-y-3">
              <p>
                Enable <span className="font-mono">{pendingEnable?.flagKey}</span> in{" "}
                <span className="font-mono">{pendingEnable?.environment}</span>? Running services
                pick this up within 30 seconds.
              </p>
              <TextInput
                value={reason}
                onChange={setReason}
                placeholder="Why (optional)..."
                className="w-full"
              />
            </div>
          )
        }
      />

      <ActionModal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)}>
        <div className="p-6 space-y-4">
          <h2 className="text-lg font-medium">New flag</h2>

          <TextInput
            label="Key"
            value={newKey}
            onChange={(value) => setNewKey(value.toUpperCase().replace(/[^A-Z0-9_]/g, "_"))}
            placeholder="202608_SHORT_DESC"
          />
          <p className="text-xs text-gray-500 -mt-2">
            Year and month, then a short uppercase description.
          </p>

          <Textarea
            label="Description"
            value={newDescription}
            onChange={setNewDescription}
            placeholder="What does this flag control?"
          />

          <Select
            label="Type"
            value={newValueType}
            options={VALUE_TYPE_OPTIONS}
            onChange={(value) => setNewValueType(value ?? "boolean")}
            hideSearch
          />

          {newValueType === "boolean" && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3">
              {/* eslint-disable-next-line jsx-a11y/label-has-associated-control -- the
                  heading and body text sit one level deeper than the rule's default
                  depth (2); the checkbox is still this label's only control and the
                  full text below is genuinely its accessible name. */}
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={startEnabled}
                  onChange={(e) => setStartEnabled(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-amber-500 cursor-pointer"
                />
                <span>
                  <span className="flex items-center gap-2 text-sm font-medium text-amber-200">
                    <FontAwesomeIcon
                      icon={faExclamationTriangle}
                      className="text-amber-400 text-xs"
                      aria-hidden="true"
                    />
                    Start enabled everywhere
                  </span>
                  <span className="block text-xs text-amber-300/80 mt-1">
                    This flag goes live in every environment the moment it is created, the opposite
                    of every other flag. Unchecking this later does nothing: only the flag&apos;s
                    own toggle turns the feature off once it exists.
                  </span>
                </span>
              </label>
            </div>
          )}

          {!startEnabled && (
            <p className="text-xs text-gray-400">
              {environments.length > 0
                ? `Starts off in ${environments.join(", ")}. Add rules and enable it when you are ready.`
                : "Starts off in every environment."}
            </p>
          )}

          <div className="flex gap-2">
            <Button
              variant={startEnabled ? "danger" : undefined}
              onClick={handleCreateClick}
              disabled={isCreating}
            >
              {isCreating ? "Creating..." : "Create flag"}
            </Button>
            <Button
              variant="secondary"
              onClick={() => setIsCreateOpen(false)}
              disabled={isCreating}
            >
              Cancel
            </Button>
          </div>
        </div>
      </ActionModal>
    </div>
  );
}
