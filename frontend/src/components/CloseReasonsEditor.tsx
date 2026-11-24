import { useState, type FC } from "react";
import Button from "@/components/Button";
import TextInput from "@/components/TextInput";
import ImportCloseReasonsModal from "@/components/modals/ImportCloseReasonsModal";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowDown,
  faArrowUp,
  faDownload,
  faPlus,
  faTrash,
} from "@fortawesome/free-solid-svg-icons";
import { CLOSE_REASON_LIMITS } from "@/constants/closeReasonLimits";
import { findDuplicateCloseReasons } from "@/lib/close-reasons";
import type { Panel } from "@/types";

interface CloseReasonsEditorProps {
  reasons: string[];
  onChange: (reasons: string[]) => void;
  importPanels?: Panel[];
}

const CloseReasonsEditor: FC<CloseReasonsEditorProps> = ({
  reasons,
  onChange,
  importPanels = [],
}) => {
  const [importOpen, setImportOpen] = useState(false);
  const duplicates = findDuplicateCloseReasons(reasons);
  const sourcePanels = importPanels.filter((panel) => panel.close_reasons?.reasons.length);

  const updateReason = (index: number, value: string) => {
    onChange(reasons.map((r, i) => (i === index ? value : r)));
  };

  const removeReason = (index: number) => {
    onChange(reasons.filter((_, i) => i !== index));
  };

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= reasons.length) return;

    const next = [...reasons];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  const addReason = () => {
    if (reasons.length >= CLOSE_REASON_LIMITS.PRESETS) return;
    onChange([...reasons, ""]);
  };

  return (
    <div className="flex flex-col gap-2">
      {reasons.length > 0 && (
        <ol className="flex flex-col gap-2" aria-label="Close Reasons">
          {reasons.map((reason, i) => (
            <li key={i} className="flex items-start gap-2">
              <TextInput
                className="flex-1"
                placeholder="Close reason"
                value={reason}
                onChange={(v) => updateReason(i, v)}
                maxLength={CLOSE_REASON_LIMITS.LENGTH}
                showCount
                error={duplicates.has(i) ? "Duplicate close reason" : undefined}
              />
              <div className="mt-1.5 flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  title={`Move close reason ${i + 1} up`}
                >
                  <FontAwesomeIcon icon={faArrowUp} aria-hidden="true" />
                  <span className="sr-only">Move close reason {i + 1} up</span>
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => move(i, 1)}
                  disabled={i === reasons.length - 1}
                  title={`Move close reason ${i + 1} down`}
                >
                  <FontAwesomeIcon icon={faArrowDown} aria-hidden="true" />
                  <span className="sr-only">Move close reason {i + 1} down</span>
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeReason(i)}
                  className="text-red-400 hover:text-red-300"
                  title={`Remove close reason ${i + 1}`}
                >
                  <FontAwesomeIcon icon={faTrash} aria-hidden="true" />
                  <span className="sr-only">Remove close reason {i + 1}</span>
                </Button>
              </div>
            </li>
          ))}
        </ol>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="secondary"
          onClick={addReason}
          disabled={reasons.length >= CLOSE_REASON_LIMITS.PRESETS}
          className="text-sm font-medium w-fit"
        >
          <FontAwesomeIcon icon={faPlus} /> Add Reason
        </Button>
        {sourcePanels.length > 0 && (
          <Button
            variant="secondary"
            onClick={() => setImportOpen(true)}
            className="text-sm font-medium w-fit"
          >
            <FontAwesomeIcon icon={faDownload} /> Import
          </Button>
        )}
        <span className="text-xs">
          {reasons.length}/{CLOSE_REASON_LIMITS.PRESETS} reasons
        </span>
      </div>
      <ImportCloseReasonsModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        panels={sourcePanels}
        reasons={reasons}
        onImport={onChange}
      />
    </div>
  );
};

export default CloseReasonsEditor;
