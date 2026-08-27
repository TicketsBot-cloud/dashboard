import { useRef, useEffect, useState, type FC } from "react";
import { createPortal } from "react-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faColumns } from "@fortawesome/free-solid-svg-icons";
import Button from "@/components/Button";

interface ColumnDef {
  key: string;
  label: string;
}

interface ColumnSelectorButtonProps {
  columns: ColumnDef[];
  selectedColumns: string[];
  onToggleColumn: (key: string) => void;
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
}

const ColumnSelectorButton: FC<ColumnSelectorButtonProps> = ({
  columns,
  selectedColumns,
  onToggleColumn,
  isOpen,
  onToggle,
  onClose,
}) => {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const updatePosition = () => {
      if (!buttonRef.current) return;
      const rect = buttonRef.current.getBoundingClientRect();
      setPosition({ top: rect.bottom + 4, left: rect.right - 224 /* w-56 = 14rem = 224px */ });
    };
    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [isOpen]);

  return (
    <>
      <Button
        ref={buttonRef}
        variant="secondary"
        className="gap-1.5 rounded-lg text-sm"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-label="Toggle columns"
      >
        <FontAwesomeIcon icon={faColumns} />
        <span>Columns</span>
      </Button>

      {isOpen &&
        createPortal(
          <div
            ref={dropdownRef}
            className="fixed w-56 bg-gray-800 border border-neutral-600 rounded shadow-lg z-popover overflow-hidden"
            style={{ top: position.top, left: position.left }}
          >
            <div className="px-3 py-2 border-b border-gray-700">
              <span className="text-xs font-medium text-gray-400 uppercase">Visible Columns</span>
            </div>
            <ul className="max-h-64 overflow-y-auto p-1">
              {columns.map((col) => {
                const isSelected = selectedColumns.includes(col.key);
                return (
                  <li
                    key={col.key}
                    className={`flex items-center justify-between px-2.5 py-2 rounded cursor-pointer transition-colors ${
                      isSelected ? "bg-blue-500/15" : "hover:bg-gray-700"
                    }`}
                    onClick={() => onToggleColumn(col.key)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onToggleColumn(col.key);
                      }
                    }}
                    role="option"
                    aria-selected={isSelected}
                    tabIndex={0}
                  >
                    <span className="text-sm text-gray-200">{col.label}</span>
                    {isSelected && <span className="text-blue-400 text-xs">&#10003;</span>}
                  </li>
                );
              })}
            </ul>
          </div>,
          document.body,
        )}
    </>
  );
};

export default ColumnSelectorButton;
