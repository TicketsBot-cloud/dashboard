import type { CSSProperties, FC, ReactNode } from "react";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChevronUp,
  faChevronDown,
  faTrash,
  faGripVertical,
} from "@fortawesome/free-solid-svg-icons";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Button from "@/components/Button";

interface MoveTarget {
  id: string;
  label: string;
}

interface BlockShellProps {
  /** Stable id of the block this shell renders, used as the dnd-kit sortable item id. */
  id: string;
  label: string;
  icon: IconDefinition;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  moveIntoContainerTargets?: MoveTarget[];
  onMoveIntoContainer?: (containerId: string) => void;
  canMoveOutOfContainer: boolean;
  onMoveOutOfContainer?: () => void;
  onDelete: () => void;
  /** Visual depth cue for a block rendered inside a Container's block list. */
  nested?: boolean;
  disabled?: boolean;
  children: ReactNode;
}

const BlockShell: FC<BlockShellProps> = ({
  id,
  label,
  icon,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  moveIntoContainerTargets,
  onMoveIntoContainer,
  canMoveOutOfContainer,
  onMoveOutOfContainer,
  onDelete,
  nested,
  disabled,
  children,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id,
    disabled,
  });

  // The actual floating drag preview is rendered by ComponentTreeBuilder's DragOverlay, so this
  // card only ever needs to show where it would land if dropped now (a plain vertical
  // translate) - dnd-kit skips its own pointer-following transform on the source item whenever
  // a DragOverlay is present.
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={
        (nested
          ? "bg-gray-800 border-l-2 border-gray-600 ml-2 pl-4 rounded-lg p-4 mb-3"
          : "bg-gray-700 rounded-lg p-4 mb-3") + (isDragging ? " opacity-50" : "")
      }
    >
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <div className="flex items-center gap-2 text-sm font-medium text-white">
          <Button
            ref={setActivatorNodeRef}
            variant="outline"
            size="icon"
            disabled={disabled}
            aria-label={`Reorder ${label}`}
            title={`Reorder ${label}`}
            style={{ touchAction: "none" }}
            {...attributes}
            {...listeners}
          >
            <FontAwesomeIcon icon={faGripVertical} aria-hidden="true" />
          </Button>
          <FontAwesomeIcon icon={icon} className="text-gray-400" aria-hidden="true" />
          {label}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {canMoveOutOfContainer && onMoveOutOfContainer && (
            <Button variant="outline" size="sm" onClick={onMoveOutOfContainer} disabled={disabled}>
              Move out of container
            </Button>
          )}
          {!!moveIntoContainerTargets?.length && onMoveIntoContainer && (
            <select
              className="bg-gray-800 border border-gray-600 text-gray-300 text-xs rounded px-2 py-1 disabled:opacity-50"
              value=""
              disabled={disabled}
              aria-label={`Move ${label} into a container`}
              onChange={(e) => {
                if (e.target.value) onMoveIntoContainer(e.target.value);
                e.target.value = "";
              }}
            >
              <option value="">Move into container...</option>
              {moveIntoContainerTargets.map((target) => (
                <option key={target.id} value={target.id}>
                  {target.label}
                </option>
              ))}
            </select>
          )}
          <Button
            variant="primary"
            size="icon"
            onClick={onMoveUp}
            disabled={disabled || !canMoveUp}
            aria-label={`Move ${label} up`}
            title={`Move ${label} up`}
          >
            <FontAwesomeIcon icon={faChevronUp} aria-hidden="true" />
          </Button>
          <Button
            variant="primary"
            size="icon"
            onClick={onMoveDown}
            disabled={disabled || !canMoveDown}
            aria-label={`Move ${label} down`}
            title={`Move ${label} down`}
          >
            <FontAwesomeIcon icon={faChevronDown} aria-hidden="true" />
          </Button>
          <Button
            variant="danger"
            size="icon"
            onClick={onDelete}
            disabled={disabled}
            aria-label={`Delete ${label}`}
            title={`Delete ${label}`}
          >
            <FontAwesomeIcon icon={faTrash} aria-hidden="true" />
          </Button>
        </div>
      </div>
      {children}
    </div>
  );
};

export default BlockShell;
