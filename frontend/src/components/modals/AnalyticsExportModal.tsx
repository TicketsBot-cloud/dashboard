import { useEffect, useId, useState, type FC } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faDownload } from "@fortawesome/free-solid-svg-icons";
import ActionModal from "@/components/modal-primitives/ActionModal";
import Button from "@/components/Button";
import type { ExportFormat, ExportSection } from "@/lib/analytics-export/types";
import { EXPORT_FORMATS } from "@/lib/analytics-export/types";

interface AnalyticsExportModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  contextLabel?: string;
  sections: ExportSection[];
  defaultSelectedIds?: string[];
  onExport: (selectedIds: string[], format: ExportFormat) => void;
  exporting?: boolean;
}

const AnalyticsExportModal: FC<AnalyticsExportModalProps> = ({
  open,
  onClose,
  title,
  contextLabel,
  sections,
  defaultSelectedIds,
  onExport,
  exporting = false,
}) => {
  const titleId = useId();
  const formatLabelId = useId();
  const allIds = sections.map((s) => s.id);
  const [selectedIds, setSelectedIds] = useState<string[]>(
    defaultSelectedIds ?? sections.map((s) => s.id),
  );
  const [format, setFormat] = useState<ExportFormat>("csv");

  useEffect(() => {
    if (open) {
      setSelectedIds(defaultSelectedIds ?? sections.map((s) => s.id));
      setFormat("csv");
    }
  }, [open, defaultSelectedIds, sections]);

  const toggleSection = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((existing) => existing !== id) : [...prev, id],
    );
  };

  const canExport = selectedIds.length > 0 && !exporting;

  return (
    <ActionModal isOpen={open} onClose={onClose} className="max-w-lg" ariaLabelledBy={titleId}>
      <div className="p-5 border-b border-gray-700">
        <h3 id={titleId} className="text-lg font-medium text-white">
          {title}
        </h3>
        {contextLabel && <p className="text-gray-400 text-sm mt-1">{contextLabel}</p>}
      </div>

      <div className="p-5 flex flex-col gap-4">
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-white">Data to include</span>
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" onClick={() => setSelectedIds(allIds)}>
                Select all
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setSelectedIds([])}>
                Clear
              </Button>
            </div>
          </div>

          <div className="border border-neutral-600 rounded-lg overflow-hidden bg-gray-800">
            <div className="px-3 py-2 border-b border-gray-700">
              <span className="text-xs font-medium text-gray-400 uppercase">Sections</span>
            </div>
            <ul
              className="max-h-64 overflow-y-auto p-1"
              role="listbox"
              aria-multiselectable="true"
              aria-label="Export sections"
            >
              {sections.map((section) => {
                const isSelected = selectedIds.includes(section.id);
                return (
                  <li
                    key={section.id}
                    className={`flex items-center justify-between px-2.5 py-2 rounded cursor-pointer transition-colors ${
                      isSelected ? "bg-blue-500/15" : "hover:bg-gray-700"
                    }`}
                    onClick={() => toggleSection(section.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggleSection(section.id);
                      }
                    }}
                    role="option"
                    aria-selected={isSelected}
                    tabIndex={0}
                  >
                    <div>
                      <span className="text-sm text-gray-200">{section.label}</span>
                      {section.description && (
                        <p className="text-xs text-gray-400 mt-0.5">{section.description}</p>
                      )}
                    </div>
                    {isSelected && (
                      <span className="text-blue-400 text-xs shrink-0 ml-2">&#10003;</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        <div>
          <span id={formatLabelId} className="text-sm font-medium text-white block mb-2">
            Format
          </span>
          <div className="flex gap-1" role="group" aria-labelledby={formatLabelId}>
            {EXPORT_FORMATS.map((f) => (
              <Button
                key={f}
                size="md"
                onClick={() => setFormat(f)}
                className={`${
                  format === f
                    ? "bg-blue-600 text-white"
                    : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                }`}
                aria-pressed={format === f}
              >
                {f.toUpperCase()}
              </Button>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 -mx-5 px-5 pt-4 border-t border-gray-700">
          <Button variant="secondary" size="md" onClick={onClose} disabled={exporting}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={() => onExport(selectedIds, format)}
            disabled={!canExport}
            isLoading={exporting}
          >
            {!exporting && <FontAwesomeIcon icon={faDownload} aria-hidden="true" />}
            Download
          </Button>
        </div>
      </div>
    </ActionModal>
  );
};

export default AnalyticsExportModal;
