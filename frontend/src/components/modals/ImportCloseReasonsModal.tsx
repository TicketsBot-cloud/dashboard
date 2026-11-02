import { useEffect, useId, useState, type FC } from "react";
import ActionModal from "@/components/modal-primitives/ActionModal";
import Button from "@/components/Button";
import Checkbox from "@/components/Checkbox";
import Select from "@/components/Select";
import { CLOSE_REASON_LIMITS } from "@/constants/closeReasonLimits";
import { importCloseReasons, matchCloseReason } from "@/lib/close-reasons";
import type { Panel } from "@/types";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faDownload } from "@fortawesome/free-solid-svg-icons";

interface ImportCloseReasonsModalProps {
  open: boolean;
  onClose: () => void;
  panels: Panel[];
  reasons: string[];
  onImport: (reasons: string[]) => void;
}

const ImportCloseReasonsModal: FC<ImportCloseReasonsModalProps> = ({
  open,
  onClose,
  panels,
  reasons,
  onImport,
}) => {
  const headingId = useId();
  const [panelId, setPanelId] = useState<string | null>(null);
  const [replace, setReplace] = useState(false);
  const [ticked, setTicked] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) {
      setPanelId(null);
      setReplace(false);
      setTicked(new Set());
    }
  }, [open]);

  const existing = reasons.map((reason) => reason.trim()).filter(Boolean);
  const isAdded = (reason: string) => matchCloseReason(existing, reason) !== undefined;
  const reasonsOf = (id: string | null) =>
    panels.find((panel) => String(panel.panel_id) === id)?.close_reasons?.reasons ?? [];
  const selectableOf = (id: string | null, replaceMode: boolean) =>
    reasonsOf(id).filter((reason) => replaceMode || !isAdded(reason));

  const options = panels.map((panel) => ({ key: String(panel.panel_id), label: panel.title }));
  const source = reasonsOf(panelId);
  const selectable = selectableOf(panelId, replace);
  const incoming = selectable.filter((reason) => ticked.has(reason));
  const allTicked = selectable.length > 0 && incoming.length === selectable.length;
  const remaining = CLOSE_REASON_LIMITS.PRESETS - existing.length;
  const overLimit = !replace && incoming.length > remaining;

  const selectPanel = (id: string | null) => {
    if (id === panelId) return;
    setPanelId(id);
    setTicked(new Set(selectableOf(id, replace)));
  };

  const toggleReplace = (checked: boolean) => {
    setReplace(checked);
    setTicked(new Set(selectableOf(panelId, checked)));
  };

  const toggleReason = (reason: string, checked: boolean) => {
    setTicked((prev) => {
      const next = new Set(prev);
      if (checked) next.add(reason);
      else next.delete(reason);
      return next;
    });
  };

  const handleImport = () => {
    onImport(importCloseReasons(reasons, incoming, replace));
    onClose();
  };

  return (
    <ActionModal
      isOpen={open}
      onClose={onClose}
      className="max-w-lg max-h-[90vh] overflow-y-auto"
      ariaLabelledBy={headingId}
    >
      <div className="p-6">
        <h3 id={headingId} className="text-xl font-semibold mb-4">
          Import Close Reasons
        </h3>

        <div className="space-y-4">
          <Select
            label="Panel"
            placeholder="Select a panel..."
            value={panelId}
            onChange={selectPanel}
            options={options}
            hideSearch={options.length <= 5}
          />

          {source.length > 0 && (
            <>
              <div className="border border-neutral-600 rounded-lg overflow-hidden">
                <div className="px-3 py-2 border-b border-gray-700">
                  <Checkbox
                    checked={allTicked}
                    indeterminate={incoming.length > 0 && !allTicked}
                    disabled={selectable.length === 0}
                    onChange={(checked) => setTicked(new Set(checked ? selectable : []))}
                    label="Select all"
                  />
                </div>
                <ul
                  className="relative max-h-64 overflow-y-auto px-3 py-2 space-y-2 wrap-anywhere"
                  // Focus only scrolls the 1px sr-only input into view, not its row.
                  onFocus={(e) => e.target.closest("li")?.scrollIntoView({ block: "nearest" })}
                >
                  {source.map((reason, i) => {
                    const added = !replace && isAdded(reason);
                    return (
                      <li key={i} className="flex items-center gap-2">
                        <Checkbox
                          checked={ticked.has(reason)}
                          disabled={added}
                          onChange={(checked) => toggleReason(reason, checked)}
                          label={reason}
                        />
                        {added && (
                          <span className="text-xs text-gray-400 shrink-0">Already added</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>

              {overLimit && (
                <p className="text-xs text-red-400" role="alert">
                  Only {remaining} more {remaining === 1 ? "reason fits" : "reasons fit"}.
                </p>
              )}

              {existing.length > 0 && (
                <Checkbox
                  checked={replace}
                  onChange={toggleReplace}
                  label="Replace existing reasons"
                />
              )}
            </>
          )}
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleImport}
            disabled={incoming.length === 0 || overLimit}
            className="font-medium"
          >
            <FontAwesomeIcon icon={faDownload} aria-hidden="true" />
            Import
          </Button>
        </div>
      </div>
    </ActionModal>
  );
};

export default ImportCloseReasonsModal;
