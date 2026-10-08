import { useEffect, useRef, useState, type FC } from "react";
import { createPortal } from "react-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import {
  faLayerGroup,
  faColumns,
  faMinus,
  faFont,
  faImages,
  faLink,
  faTicket,
} from "@fortawesome/free-solid-svg-icons";
import Button from "@/components/Button";
import { useFloatingDropdown } from "@/hooks/useFloatingDropdown";
import {
  blockLabel,
  hasPanelSelectBlock,
  type V2Component,
  type V2ComponentType,
} from "@/lib/component-tree";

interface AddBlockMenuProps {
  onAdd: (type: V2ComponentType) => void;
  /** Types not offered here, e.g. "container" inside a ContainerEditor's own menu. */
  exclude?: V2ComponentType[];
  /** The full tree this menu is adding into, used to gate "Panel Select" to at most one per tree. */
  tree: V2Component[];
  /**
   * Panels not yet placed elsewhere in the tree. Undefined means no "panels" concept applies
   * here (single-panel/welcome-message builder), so the "Panel Select" entry is omitted
   * entirely rather than merely disabled.
   */
  availablePanels?: { panel_id: number; label: string; emoji?: string }[];
  /**
   * The multipanel's own "dropdown mode" toggle. Explicitly `false` disables "Panel Select"
   * with a dedicated tooltip; omitted (undefined) applies no extra restriction beyond
   * `hasPanelSelectBlock`.
   */
  selectMenuModeOn?: boolean;
}

// Button Row sits in Layout rather than Content: like Separator, it's a structural row rather
// than media/text content, and it's the row itself (not "buttons" as freestanding content) that
// an admin is placing into the message. Panel Select joins it for the same reason.
const LAYOUT_TYPES: V2ComponentType[] = [
  "container",
  "section",
  "separator",
  "button_row",
  "panel_select",
];
const CONTENT_TYPES: V2ComponentType[] = ["text_display", "media_gallery"];

const ICONS: Record<V2ComponentType, IconDefinition> = {
  container: faLayerGroup,
  section: faColumns,
  separator: faMinus,
  text_display: faFont,
  media_gallery: faImages,
  button_row: faLink,
  panel_select: faTicket,
};

const AddBlockMenu: FC<AddBlockMenuProps> = ({
  onAdd,
  exclude = [],
  tree,
  availablePanels,
  selectMenuModeOn,
}) => {
  const [isOpen, setIsOpen] = useState(false);
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
    // Deferred: an add can exhaust the block budget and unmount this menu (trigger included)
    // in the same update, so wait for that commit before deciding whether there's still a
    // trigger to focus - focusing it synchronously here would focus a node about to be removed.
    requestAnimationFrame(() => triggerRef.current?.focus());
  };

  useEffect(() => {
    // The dropdown is portaled to the end of document.body, so a keyboard user tabbing
    // from the trigger would otherwise skip straight past it - move focus in explicitly.
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
    return undefined;
  };

  const renderGroup = (title: string, types: V2ComponentType[]) => {
    if (types.length === 0) return null;
    return (
      <div className="p-1">
        <p className="px-2 py-1 text-[10px] uppercase tracking-wide text-gray-500">{title}</p>
        {types.map((type) => {
          const reason = disabledReason(type);
          return (
            <button
              key={type}
              type="button"
              aria-disabled={!!reason || undefined}
              title={reason}
              className={`flex items-center gap-2 w-full text-left px-2 py-1.5 rounded text-sm ${
                reason
                  ? "text-gray-500 cursor-not-allowed hover:bg-transparent"
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
                icon={ICONS[type]}
                className="text-gray-400 w-4"
                aria-hidden="true"
              />
              {blockLabel(type)}
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <>
      <Button
        ref={triggerRef}
        variant="dashed"
        className="w-full"
        onClick={() => setIsOpen((v) => !v)}
      >
        + Add block
      </Button>
      {isOpen &&
        createPortal(
          <div
            ref={dropdownRef}
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
