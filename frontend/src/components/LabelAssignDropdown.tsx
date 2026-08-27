import type { FC } from "react";
import { useCallback, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useFloatingDropdown } from "@/hooks/useFloatingDropdown";
import Button from "@/components/Button";
import LabelBadge from "@/components/LabelBadge";
import type { TicketLabel } from "@/types";

interface LabelAssignDropdownProps {
  labels: TicketLabel[];
  assigned: number[];
  onChange: (ids: number[]) => void;
}

const LabelAssignDropdown: FC<LabelAssignDropdownProps> = ({ labels, assigned, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [current, setCurrent] = useState<number[]>(assigned);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const closeDropdown = useCallback(() => setIsOpen(false), []);

  const { position } = useFloatingDropdown({
    isOpen,
    triggerRef,
    dropdownRef,
    onClose: closeDropdown,
    maxHeight: 192,
    minWidth: 224,
  });

  const toggleOpen = () => {
    if (!isOpen) setCurrent(assigned);
    setIsOpen((open) => !open);
  };

  const toggle = (labelId: number) => {
    const next = current.includes(labelId)
      ? current.filter((id) => id !== labelId)
      : [...current, labelId];
    setCurrent(next);
    onChange(next);
  };

  return (
    <>
      <Button
        ref={triggerRef}
        variant="dashed"
        size="icon"
        className="w-6 h-6 p-0 rounded-full border-gray-500 text-gray-400 hover:border-gray-300 hover:text-gray-200 text-xs"
        onClick={toggleOpen}
        type="button"
        title="Assign labels"
        aria-label="Assign labels"
        aria-expanded={isOpen}
      >
        +
      </Button>

      {isOpen &&
        createPortal(
          <div
            ref={dropdownRef}
            className="fixed bg-gray-800 border border-neutral-600 rounded shadow-lg z-popover overflow-y-auto"
            style={{
              top: position.top,
              left: position.left,
              width: position.width,
              maxHeight: position.maxHeight,
            }}
          >
            <ul className="p-1" role="listbox" aria-label="Labels">
              {labels.map((label) => {
                const isSelected = current.includes(label.label_id);
                return (
                  <li
                    key={label.label_id}
                    className={`flex items-center justify-between px-2.5 py-2 rounded cursor-pointer transition-colors ${
                      isSelected ? "bg-blue-500/15" : "hover:bg-gray-700"
                    }`}
                    onClick={() => toggle(label.label_id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggle(label.label_id);
                      }
                    }}
                    role="option"
                    aria-selected={isSelected}
                    tabIndex={0}
                  >
                    <LabelBadge name={label.name} colour={label.colour} />
                    {isSelected && <span className="text-blue-400 text-xs">&#10003;</span>}
                  </li>
                );
              })}
              {labels.length === 0 && (
                <li className="text-gray-400 text-center py-3 text-sm">No labels available</li>
              )}
            </ul>
          </div>,
          document.body,
        )}
    </>
  );
};

export default LabelAssignDropdown;
