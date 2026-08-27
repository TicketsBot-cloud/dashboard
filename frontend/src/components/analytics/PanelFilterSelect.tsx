import { useState, useRef, useEffect, useCallback, useMemo, type FC } from "react";
import { createPortal } from "react-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChevronDown,
  faXmark,
  faCheck,
  faMagnifyingGlass,
} from "@fortawesome/free-solid-svg-icons";
import { useFloatingDropdown } from "@/hooks/useFloatingDropdown";
import { splitCanonical, canonicalise, selectPanelIds } from "@/lib/analytics-panel-filter";
import type { PanelAnalyticsResponse, PanelPerformanceRow, PanelGroups } from "@/types";

// Preset group built from the API's `groups` payload
interface Preset {
  id: string;
  name: string;
  panelIds: number[];
  count: number;
}

interface PanelFilterSelectProps {
  /** Canonical panel filter string. Empty = all panels. */
  value: string;
  onChange: (canonical: string) => void;
  panelsData: PanelAnalyticsResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  className?: string;
}

/** Build preset list from the groups payload. */
function buildPresets(groups: PanelGroups | undefined): Preset[] {
  if (!groups) return [];
  const presets: Preset[] = [];

  for (const team of groups.teams ?? []) {
    presets.push({
      id: `team-${team.id}`,
      name: team.name,
      panelIds: team.panel_ids,
      count: team.panel_ids.length,
    });
  }

  for (const mp of groups.multi_panels ?? []) {
    presets.push({
      id: `mp-${mp.id}`,
      name: mp.name,
      panelIds: mp.panel_ids,
      count: mp.panel_ids.length,
    });
  }

  if (groups.default_team_panel_ids && groups.default_team_panel_ids.length > 0) {
    presets.push({
      id: "default-team",
      name: "Handled by default support staff",
      panelIds: groups.default_team_panel_ids,
      count: groups.default_team_panel_ids.length,
    });
  }

  return presets;
}

/** Find panels that share a title and need disambiguation. */
function findDuplicateTitles(panels: PanelPerformanceRow[]): Set<string> {
  const seen = new Map<string, number>();
  for (const p of panels) {
    seen.set(p.title, (seen.get(p.title) ?? 0) + 1);
  }
  const dupes = new Set<string>();
  for (const [title, count] of seen) {
    if (count > 1) dupes.add(title);
  }
  return dupes;
}

/** Compute trigger label from current selection state. */
function computeLabel(
  selectedKeys: string[],
  panels: PanelPerformanceRow[],
  presets: Preset[],
): { label: string; subLabel?: string; fullLabel: string } {
  if (selectedKeys.length === 0) {
    return { label: "All panels", fullLabel: "All panels" };
  }

  if (selectedKeys.length === 1) {
    const key = selectedKeys[0];
    if (key === "none") {
      return { label: "No panel", fullLabel: "No panel" };
    }
    const id = parseInt(key, 10);
    const panel = panels.find((p) => p.panel_id === id);
    const title = panel?.title ?? `Panel ${key}`;
    return { label: title, fullLabel: title };
  }

  // Check if selection exactly matches a preset
  const numericIds = selectedKeys
    .filter((k) => k !== "none")
    .map((k) => parseInt(k, 10))
    .sort((a, b) => a - b);
  const hasNone = selectedKeys.includes("none");

  if (!hasNone) {
    for (const preset of presets) {
      const presetSorted = [...preset.panelIds].sort((a, b) => a - b);
      if (
        presetSorted.length === numericIds.length &&
        presetSorted.every((id, i) => id === numericIds[i])
      ) {
        const sub = `(${preset.count} panel${preset.count === 1 ? "" : "s"})`;
        return {
          label: preset.name,
          subLabel: sub,
          fullLabel: `${preset.name} ${sub}`,
        };
      }
    }
  }

  const count = selectedKeys.length;
  const text = `${count} panel${count === 1 ? "" : "s"}`;
  return { label: text, fullLabel: text };
}

const CheckIcon: FC = () => (
  <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
    <path
      fillRule="evenodd"
      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
      clipRule="evenodd"
    />
  </svg>
);

const PanelFilterSelect: FC<PanelFilterSelectProps> = ({
  value,
  onChange,
  panelsData,
  isLoading,
  isError,
  className = "",
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const triggerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const headerCheckboxRef = useRef<HTMLInputElement>(null);

  const selectedKeys = useMemo(() => splitCanonical(value), [value]);
  const isFiltered = selectedKeys.length > 0;

  const panels = useMemo(() => panelsData?.panels ?? [], [panelsData?.panels]);
  const presets = useMemo(() => buildPresets(panelsData?.groups), [panelsData?.groups]);
  const duplicateTitles = useMemo(() => findDuplicateTitles(panels), [panels]);

  // Separate real panels from "no panel" row
  const realPanels = useMemo(() => panels.filter((p) => p.panel_id !== null), [panels]);
  const noPanelRow = useMemo(() => panels.find((p) => p.panel_id === null), [panels]);

  const { label, subLabel, fullLabel } = useMemo(
    () => computeLabel(selectedKeys, panels, presets),
    [selectedKeys, panels, presets],
  );

  const closeDropdown = useCallback(() => {
    setIsOpen(false);
    setSearchText("");
    // Return focus to trigger on close
    triggerRef.current?.querySelector("button")?.focus();
  }, []);

  const { position } = useFloatingDropdown({
    isOpen,
    triggerRef,
    dropdownRef,
    onClose: closeDropdown,
    maxHeight: 420,
    minWidth: 320,
  });

  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  // Global Escape key handler for the dropdown
  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (searchText) {
          setSearchText("");
        } else {
          closeDropdown();
        }
      }
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, searchText, closeDropdown]);

  // Close on focus escape: if focus moves outside both trigger and dropdown,
  // close the popup. Non-modal close, not a hard focus trap.
  useEffect(() => {
    if (!isOpen) return;
    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current &&
        !triggerRef.current.contains(target) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(target)
      ) {
        closeDropdown();
      }
    };
    document.addEventListener("focusin", handleFocusIn);
    return () => document.removeEventListener("focusin", handleFocusIn);
  }, [isOpen, closeDropdown]);

  const handleTogglePanel = useCallback(
    (key: string) => {
      const keys = [...selectedKeys];
      const idx = keys.indexOf(key);
      if (idx >= 0) {
        keys.splice(idx, 1);
      } else {
        keys.push(key);
      }
      onChange(canonicalise(keys));
    },
    [selectedKeys, onChange],
  );

  const handlePresetClick = useCallback(
    (preset: Preset) => {
      onChange(selectPanelIds(preset.panelIds));
    },
    [onChange],
  );

  const handleSelectAll = useCallback(() => {
    onChange("");
    closeDropdown();
  }, [onChange, closeDropdown]);

  const handleClear = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onChange("");
    },
    [onChange],
  );

  // Filter panels by search text
  const filteredPanels = useMemo(() => {
    if (!searchText) return realPanels;
    const lower = searchText.toLowerCase();
    return realPanels.filter((p) => p.title.toLowerCase().includes(lower));
  }, [realPanels, searchText]);

  const filteredPresets = useMemo(() => {
    if (!searchText) return presets;
    const lower = searchText.toLowerCase();
    return presets.filter((p) => p.name.toLowerCase().includes(lower));
  }, [presets, searchText]);

  const showNoPanel = useMemo(() => {
    if (!noPanelRow) return false;
    if (!searchText) return true;
    return "no panel".includes(searchText.toLowerCase());
  }, [noPanelRow, searchText]);

  const noResults = filteredPanels.length === 0 && filteredPresets.length === 0 && !showNoPanel;

  // Track indeterminate state for the select-all checkbox in the dropdown
  const allRealSelected =
    realPanels.length > 0 && realPanels.every((p) => selectedKeys.includes(String(p.panel_id)));
  const someRealSelected =
    !allRealSelected && realPanels.some((p) => selectedKeys.includes(String(p.panel_id)));

  useEffect(() => {
    if (headerCheckboxRef.current) {
      headerCheckboxRef.current.indeterminate = someRealSelected;
    }
  }, [someRealSelected]);

  const noPanels = !isLoading && !isError && panels.length === 0;

  // Do not render the control if the request failed
  if (isError) return null;

  // Loading placeholder
  if (isLoading) {
    return (
      <div className={className} aria-hidden="true">
        <div className="h-8 w-full animate-pulse rounded-lg bg-gray-700 sm:w-56" />
      </div>
    );
  }

  const hasClear = isFiltered;

  return (
    <div ref={triggerRef} className={className}>
      <div className="inline-flex h-8 w-full items-stretch rounded-lg bg-gray-700 sm:w-56">
        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={isOpen}
          title={fullLabel}
          disabled={noPanels}
          onClick={() => setIsOpen(!isOpen)}
          className={`inline-flex min-w-0 flex-1 items-center gap-2 px-3 text-sm transition-colors
            focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500
            ${hasClear ? "rounded-l-lg" : "rounded-lg"}
            ${noPanels ? "cursor-not-allowed text-gray-500" : ""}
            ${
              isFiltered && !noPanels
                ? "bg-blue-500/15 text-white ring-1 ring-inset ring-blue-500/50 hover:bg-blue-500/25"
                : !noPanels
                  ? "text-gray-300 hover:bg-gray-600"
                  : ""
            }`}
        >
          <span className="truncate">{noPanels ? "No panels" : label}</span>
          {subLabel && !noPanels && <span className="ml-1 shrink-0 text-gray-400">{subLabel}</span>}
          <FontAwesomeIcon
            icon={faChevronDown}
            className={`ml-auto h-3 w-3 shrink-0 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
          />
        </button>

        {hasClear && (
          <button
            type="button"
            aria-label="Clear panel filter"
            title="Clear panel filter"
            onClick={handleClear}
            className="flex w-8 shrink-0 items-center justify-center rounded-r-lg border-l border-gray-600
                       text-gray-400 transition-colors hover:bg-gray-600 hover:text-white
                       focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
          >
            <FontAwesomeIcon icon={faXmark} className="h-3 w-3" />
          </button>
        )}
      </div>

      {isOpen &&
        createPortal(
          <div
            ref={dropdownRef}
            role="dialog"
            aria-label="Filter by panel"
            className="fixed z-popover flex flex-col overflow-hidden rounded-lg border border-gray-600 bg-gray-800 shadow-lg"
            style={{
              top: position.top,
              left: position.left,
              width: position.width,
              maxHeight: position.maxHeight,
            }}
          >
            {/* Search */}
            <div className="sticky top-0 z-10 border-b border-gray-700 bg-gray-800 p-2">
              <div className="relative">
                <FontAwesomeIcon
                  icon={faMagnifyingGlass}
                  className="pointer-events-none absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-gray-500"
                />
                <input
                  ref={searchInputRef}
                  type="text"
                  aria-label="Search panels"
                  placeholder="Search panels"
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      if (searchText) {
                        setSearchText("");
                      } else {
                        closeDropdown();
                      }
                      e.stopPropagation();
                    }
                  }}
                  className="h-8 w-full rounded-lg border border-gray-600 bg-gray-900 pl-8 pr-2 text-sm text-white
                             placeholder:text-gray-400 focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="overflow-y-auto">
              {/* All panels row */}
              <div className="border-b border-gray-700">
                <button
                  type="button"
                  onClick={handleSelectAll}
                  className={`mx-1 my-1 flex h-9 w-[calc(100%-0.5rem)] items-center gap-2.5 rounded-lg px-2 text-left text-sm
                    ${!isFiltered ? "bg-blue-500/15 text-white" : "text-gray-200 hover:bg-gray-700"}`}
                >
                  <span>All panels</span>
                  {!isFiltered && (
                    <FontAwesomeIcon icon={faCheck} className="ml-auto h-3 w-3 text-blue-400" />
                  )}
                </button>
              </div>

              {/* Presets */}
              {filteredPresets.length > 0 && (
                <div role="group" aria-label="Quick select">
                  <div
                    role="presentation"
                    className="px-3 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400"
                  >
                    Quick select
                  </div>
                  {filteredPresets.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      disabled={preset.count === 0}
                      title={preset.count === 0 ? "No panels are attached to this team" : undefined}
                      onClick={() => handlePresetClick(preset)}
                      className="mx-1 flex h-9 w-[calc(100%-0.5rem)] items-center gap-2 rounded-lg px-2 text-left text-sm
                                 text-gray-200 transition-colors hover:bg-gray-700
                                 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500
                                 disabled:cursor-not-allowed disabled:text-gray-500 disabled:hover:bg-transparent"
                    >
                      <span className="truncate">{preset.name}</span>
                      <span
                        className={`ml-auto shrink-0 text-xs tabular-nums ${preset.count === 0 ? "text-gray-600" : "text-gray-400"}`}
                      >
                        {preset.count === 0
                          ? "None"
                          : `${preset.count} panel${preset.count === 1 ? "" : "s"}`}
                      </span>
                    </button>
                  ))}
                  <div className="my-1 h-px bg-gray-700" />
                </div>
              )}

              {/* Panel checkboxes */}
              {filteredPanels.length > 0 && (
                <div role="group" aria-label="Panels">
                  <div
                    role="presentation"
                    className="px-3 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400"
                  >
                    Panels
                  </div>
                  {/* Select-all checkbox for panels */}
                  {!searchText && realPanels.length > 1 && (
                    <label
                      className={`mx-1 flex min-h-9 w-[calc(100%-0.5rem)] cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5
                        transition-colors hover:bg-gray-700
                        has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-inset has-[:focus-visible]:ring-blue-500`}
                    >
                      <input
                        ref={headerCheckboxRef}
                        type="checkbox"
                        className="peer sr-only"
                        checked={allRealSelected}
                        onChange={() => {
                          if (allRealSelected || someRealSelected) {
                            // Deselect all real panels, keep "none" if selected
                            const filtered = selectedKeys.filter((k) => k === "none");
                            onChange(canonicalise(filtered));
                          } else {
                            // Select all real panels, keep "none" if selected
                            const ids = realPanels.map((p) => String(p.panel_id));
                            const withNone = selectedKeys.includes("none") ? [...ids, "none"] : ids;
                            onChange(canonicalise(withNone));
                          }
                        }}
                      />
                      <span
                        className="flex h-4 w-4 shrink-0 items-center justify-center rounded border border-gray-400
                                       peer-checked:border-blue-600 peer-checked:bg-blue-600
                                       peer-indeterminate:border-blue-600 peer-indeterminate:bg-blue-600"
                      >
                        {allRealSelected && <CheckIcon />}
                        {someRealSelected && (
                          <svg
                            className="w-3 h-3 text-white"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <rect x="4" y="9" width="12" height="2" rx="1" />
                          </svg>
                        )}
                      </span>
                      <span className="text-sm text-gray-300">Select all panels</span>
                    </label>
                  )}
                  {filteredPanels.map((panel) => {
                    const key = String(panel.panel_id);
                    const isChecked = selectedKeys.includes(key);
                    const needsDisambiguation = duplicateTitles.has(panel.title);

                    return (
                      <label
                        key={key}
                        className={`mx-1 flex min-h-9 w-[calc(100%-0.5rem)] cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5
                          transition-colors
                          has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-inset has-[:focus-visible]:ring-blue-500
                          ${isChecked ? "bg-blue-500/15 hover:bg-blue-500/25" : "hover:bg-gray-700"}`}
                      >
                        <input
                          type="checkbox"
                          className="peer sr-only"
                          checked={isChecked}
                          onChange={() => handleTogglePanel(key)}
                        />
                        <span
                          className="flex h-4 w-4 shrink-0 items-center justify-center rounded border border-gray-400
                                         peer-checked:border-blue-600 peer-checked:bg-blue-600"
                        >
                          {isChecked && <CheckIcon />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-white">{panel.title}</span>
                          {needsDisambiguation && (
                            <span className="block truncate text-xs text-gray-400">
                              #{panel.channel_id}
                            </span>
                          )}
                        </span>
                        {(panel.disabled || panel.force_disabled) && (
                          <span
                            className="ml-2 shrink-0 rounded bg-gray-700 px-1.5 py-0.5 text-[10px] font-medium uppercase
                                           tracking-wide text-gray-300 ring-1 ring-inset ring-gray-600"
                          >
                            Disabled
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>
              )}

              {/* No panel row */}
              {showNoPanel && (
                <div className="mt-1 border-t border-gray-700 pt-1">
                  <label
                    className={`mx-1 flex min-h-9 w-[calc(100%-0.5rem)] cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5
                      transition-colors
                      has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-inset has-[:focus-visible]:ring-blue-500
                      ${selectedKeys.includes("none") ? "bg-blue-500/15 hover:bg-blue-500/25" : "hover:bg-gray-700"}`}
                  >
                    <input
                      type="checkbox"
                      className="peer sr-only"
                      checked={selectedKeys.includes("none")}
                      onChange={() => handleTogglePanel("none")}
                    />
                    <span
                      className="flex h-4 w-4 shrink-0 items-center justify-center rounded border border-gray-400
                                     peer-checked:border-blue-600 peer-checked:bg-blue-600"
                    >
                      {selectedKeys.includes("none") && <CheckIcon />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-white">No panel</span>
                      <span className="block truncate text-xs text-gray-400">
                        Tickets opened without a panel
                      </span>
                    </span>
                  </label>
                </div>
              )}

              {/* No results */}
              {noResults && (
                <p className="px-3 py-6 text-center text-sm text-gray-400">
                  No panels match that search.
                </p>
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
};

export default PanelFilterSelect;
