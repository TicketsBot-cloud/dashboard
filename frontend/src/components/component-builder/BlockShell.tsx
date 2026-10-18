import { useLayoutEffect, useRef, type FC, type ReactNode } from "react";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronUp, faChevronDown, faTrash } from "@fortawesome/free-solid-svg-icons";
import Button from "@/components/Button";

interface MoveTarget {
  id: string;
  label: string;
}

interface BlockShellProps {
  blockId: string;
  label: string;
  /** The enclosing container's label, prefixed onto every accessible name when nested. */
  containerLabel?: string;
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
  nested?: boolean;
  disabled?: boolean;
  children: ReactNode;
}

const BlockShell: FC<BlockShellProps> = ({
  blockId,
  label,
  containerLabel,
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
  const upRef = useRef<HTMLButtonElement>(null);
  const downRef = useRef<HTMLButtonElement>(null);
  const pendingFocus = useRef<"up" | "down" | null>(null);
  const fullLabel = containerLabel ? `${containerLabel}, ${label}` : label;

  // Reordering moves this block's DOM nodes, which drops focus, and the pressed arrow becomes
  // disabled at either end of the list. Restore focus to it, or to the opposite arrow.
  useLayoutEffect(() => {
    const pressed = pendingFocus.current;
    if (!pressed) return;
    pendingFocus.current = null;
    const same = pressed === "up" ? upRef.current : downRef.current;
    const opposite = pressed === "up" ? downRef.current : upRef.current;
    (same && !same.disabled ? same : opposite)?.focus();
  });

  return (
    <div
      data-block-id={blockId}
      role="group"
      aria-label={fullLabel}
      tabIndex={-1}
      className={
        nested
          ? "bg-gray-800 border-l-2 border-gray-600 ml-2 pl-4 rounded-lg p-4 mb-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          : "bg-gray-700 rounded-lg p-4 mb-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      }
    >
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <div className="flex items-center gap-2 text-sm font-medium text-white">
          <FontAwesomeIcon icon={icon} className="text-gray-400" aria-hidden="true" />
          {label}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {canMoveOutOfContainer && onMoveOutOfContainer && (
            <Button variant="outline" size="sm" onClick={onMoveOutOfContainer} disabled={disabled}>
              Move out of container
              <span className="sr-only"> ({fullLabel})</span>
            </Button>
          )}
          {!!moveIntoContainerTargets?.length && onMoveIntoContainer && (
            <select
              className="bg-gray-800 border border-gray-600 text-gray-300 text-xs rounded px-2 py-1 disabled:opacity-50"
              value=""
              disabled={disabled}
              aria-label={`Move ${fullLabel} into a container`}
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
            ref={upRef}
            variant="primary"
            size="icon"
            onClick={() => {
              pendingFocus.current = "up";
              onMoveUp();
            }}
            disabled={disabled || !canMoveUp}
            aria-label={`Move ${fullLabel} up`}
            title={`Move ${fullLabel} up`}
          >
            <FontAwesomeIcon icon={faChevronUp} aria-hidden="true" />
          </Button>
          <Button
            ref={downRef}
            variant="primary"
            size="icon"
            onClick={() => {
              pendingFocus.current = "down";
              onMoveDown();
            }}
            disabled={disabled || !canMoveDown}
            aria-label={`Move ${fullLabel} down`}
            title={`Move ${fullLabel} down`}
          >
            <FontAwesomeIcon icon={faChevronDown} aria-hidden="true" />
          </Button>
          <Button
            variant="danger"
            size="icon"
            onClick={onDelete}
            disabled={disabled}
            aria-label={`Delete ${fullLabel}`}
            title={`Delete ${fullLabel}`}
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
