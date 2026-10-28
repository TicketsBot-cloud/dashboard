import {
  Fragment,
  useEffect,
  useId,
  useRef,
  useState,
  type FC,
  type FocusEvent as ReactFocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import Button from "@/components/Button";
import { useFloatingDropdown } from "@/hooks/useFloatingDropdown";
import {
  blockLabel,
  hasPanelSelectBlock,
  type V2Component,
  type V2ComponentType,
} from "@/lib/component-tree";
import { BLOCK_ICONS } from "./block-icons";
import type { PickerPanel } from "./picker-panels";

interface AddBlockMenuProps {
  onAdd: (type: V2ComponentType) => void;
  exclude?: V2ComponentType[];
  tree: V2Component[];
  availablePanels?: PickerPanel[];
  selectMenuModeOn?: boolean;
  containerLabel?: string;
  /** Lets a delete that empties the list move focus to this trigger. */
  focusId?: string;
}

const LAYOUT_TYPES: V2ComponentType[] = [
  "container",
  "section",
  "separator",
  "button_row",
  "panel_select",
];
const CONTENT_TYPES: V2ComponentType[] = ["text_display", "media_gallery"];

const AddBlockMenu: FC<AddBlockMenuProps> = ({
  onAdd,
  exclude = [],
  tree,
  availablePanels,
  selectMenuModeOn,
  containerLabel,
  focusId,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { position } = useFloatingDropdown({
    isOpen,
    triggerRef,
    dropdownRef,
    onClose: () => setIsOpen(false),
    maxHeight: 320,
    minWidth: 220,
  });

  const closeAndReturnFocus = () => {
    setIsOpen(false);
    // Deferred: an add can exhaust the block budget and unmount this trigger in the same update.
    requestAnimationFrame(() => triggerRef.current?.focus());
  };

  useEffect(() => {
    // The dropdown is portaled to the end of document.body, so tabbing would skip past it.
    if (!isOpen) return;
    dropdownRef.current
      ?.querySelector<HTMLButtonElement>('button:not([aria-disabled="true"])')
      ?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeAndReturnFocus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  const handlePopupKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Tab") return;
    const items = Array.from(
      e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not([aria-disabled="true"])'),
    );
    const leaving = e.shiftKey ? e.target === items[0] : e.target === items[items.length - 1];
    if (!leaving) return;
    // The popup is portaled to the end of the page, so tabbing out of it would land somewhere
    // unrelated to the trigger.
    e.preventDefault();
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  const handlePopupBlur = (e: ReactFocusEvent<HTMLDivElement>) => {
    const next = e.relatedTarget;
    // A null relatedTarget is a click on non-focusable popup chrome or a window switch, not a
    // deliberate move away.
    if (!(next instanceof Node)) return;
    if (dropdownRef.current?.contains(next) || triggerRef.current?.contains(next)) return;
    setIsOpen(false);
  };

  const panelSelectAlreadyPlaced = hasPanelSelectBlock(tree);

  const layoutTypes = LAYOUT_TYPES.filter((t) => {
    if (exclude.includes(t)) return false;
    if (t === "panel_select" && availablePanels === undefined) return false;
    return true;
  });
  const contentTypes = CONTENT_TYPES.filter((t) => !exclude.includes(t));

  const disabledReason = (type: V2ComponentType): string | undefined => {
    if (type !== "panel_select") return undefined;
    if (selectMenuModeOn === false) return "Enable dropdown mode in Ticket Settings to add this";
    if (panelSelectAlreadyPlaced) return "Only one panel select block is allowed";
    if (availablePanels?.length === 0) return "Every panel is already placed as a button";
    return undefined;
  };

  const renderGroup = (title: string, types: V2ComponentType[]) => {
    if (types.length === 0) return null;
    return (
      <div className="p-1">
        <p className="px-2 py-1 text-[10px] uppercase tracking-wide text-gray-300">{title}</p>
        {types.map((type) => {
          const reason = disabledReason(type);
          const reasonId = `${menuId}-${type}-reason`;
          return (
            <Fragment key={type}>
              <button
                type="button"
                aria-disabled={!!reason || undefined}
                aria-describedby={reason ? reasonId : undefined}
                title={reason}
                className={`flex items-center gap-2 w-full text-left px-2 py-1.5 rounded text-sm ${
                  reason
                    ? "text-gray-300 cursor-not-allowed hover:bg-transparent"
                    : "text-white hover:bg-gray-600"
                }`}
                onClick={(e) => {
                  if (reason) {
                    e.preventDefault();
                    return;
                  }
                  onAdd(type);
                  closeAndReturnFocus();
                }}
              >
                <FontAwesomeIcon
                  icon={BLOCK_ICONS[type]}
                  className="text-gray-400 w-4"
                  aria-hidden="true"
                />
                {blockLabel(type)}
              </button>
              {reason && (
                <span id={reasonId} hidden>
                  {reason}
                </span>
              )}
            </Fragment>
          );
        })}
      </div>
    );
  };

  return (
    <>
      <Button
        ref={triggerRef}
        data-block-id={focusId}
        variant="dashed"
        className="w-full"
        aria-label={containerLabel ? `Add block to ${containerLabel}` : undefined}
        aria-expanded={isOpen}
        aria-controls={isOpen ? menuId : undefined}
        onClick={() => setIsOpen((v) => !v)}
      >
        + Add block
      </Button>
      {isOpen &&
        createPortal(
          // The handlers only manage focus leaving the group; the items inside are the controls.
          // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
          <div
            ref={dropdownRef}
            id={menuId}
            role="group"
            aria-label="Add block"
            onKeyDown={handlePopupKeyDown}
            onBlur={handlePopupBlur}
            className="fixed bg-gray-700 border border-neutral-600 rounded shadow-lg z-popover overflow-y-auto"
            style={{
              top: position.top,
              left: position.left,
              width: position.width,
              maxHeight: position.maxHeight,
            }}
          >
            {renderGroup("Layout", layoutTypes)}
            {renderGroup("Content", contentTypes)}
          </div>,
          document.body,
        )}
    </>
  );
};

export default AddBlockMenu;
