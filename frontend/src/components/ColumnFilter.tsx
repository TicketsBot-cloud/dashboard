import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFilter } from "@fortawesome/free-solid-svg-icons";
import Button from "@/components/Button";
import { useFloatingDropdown } from "@/hooks/useFloatingDropdown";

interface ColumnFilterProps {
  label: string;
  active: boolean;
  /** Replaces the plain label, so a sortable header can put its trigger here. */
  labelSlot?: ReactNode;
  children: ReactNode;
}

export default function ColumnFilter({ label, active, labelSlot, children }: ColumnFilterProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Portalled: the table wrapper is `overflow-x-auto` and would clip an in-cell popover.
  const { position } = useFloatingDropdown({
    isOpen: open,
    triggerRef,
    dropdownRef,
    onClose: () => setOpen(false),
    minWidth: 240,
    maxHeight: 320,
  });

  useEffect(() => {
    if (!open) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [open]);

  return (
    <div className="inline-flex items-center">
      {labelSlot ?? <span>{label}</span>}
      <Button
        ref={triggerRef}
        variant="ghost"
        size="icon"
        onClick={() => setOpen(!open)}
        className={`ml-1.5 p-0.5 rounded transition-colors ${
          active ? "text-blue-400" : "text-gray-400 hover:text-gray-200"
        }`}
        aria-label={`Filter by ${label}`}
        aria-expanded={open}
      >
        <FontAwesomeIcon icon={faFilter} className="text-xs" />
      </Button>
      {open &&
        createPortal(
          <div
            ref={dropdownRef}
            className="fixed z-popover overflow-y-auto rounded-lg border border-gray-600 bg-gray-700 p-3 shadow-lg"
            style={{
              top: position.top,
              left: position.left,
              width: position.width,
              maxHeight: position.maxHeight,
            }}
          >
            {children}
          </div>,
          document.body,
        )}
    </div>
  );
}
