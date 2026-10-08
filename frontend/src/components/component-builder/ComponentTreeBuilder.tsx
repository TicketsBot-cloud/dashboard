import { useState, type FC } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { GuildEmoji } from "@/types";
import {
  blockLabel,
  findBlock,
  moveBlockToIndex,
  sameList,
  type V2Component,
} from "@/lib/component-tree";
import ComponentBudgetMeter from "./ComponentBudgetMeter";
import BlockList, { BLOCK_ICONS } from "./BlockList";

type AvailablePanel = { panel_id: number; label: string; emoji?: string };

interface ComponentTreeBuilderProps {
  components: V2Component[];
  onChange: (components: V2Component[]) => void;
  guildEmojis: GuildEmoji[];
  budgetUsed: number;
  budgetMax: number;
  budgetReservedNote?: string;
  disabled?: boolean;
  /** Top-level slot budget (10 minus whatever the backend reserves for this surface). */
  topLevelMax?: number;
  /**
   * Panels not yet placed elsewhere in the tree, threaded straight through to BlockList - see
   * its prop of the same name. Undefined means this builder has no "panels" concept at all
   * (single-panel or welcome-message message), so no panel-placement UI renders anywhere below.
   */
  availablePanels?: AvailablePanel[];
  /** The full, unfiltered panel list for this multipanel - see BlockList's prop of the same name. */
  allPanels?: AvailablePanel[];
  /** The multipanel's own "dropdown mode" toggle - see BlockList's prop of the same name. */
  selectMenuModeOn?: boolean;
}

/**
 * Locates a block anywhere in the tree (top level, or one level into a Container) for the
 * purpose of phrasing an accessible drag announcement - a small local mirror of
 * component-tree.ts's internal locateBlock, kept here since it only needs to answer "what's the
 * label, and where does it sit in its own list", not perform any tree mutation.
 */
const describeBlock = (
  tree: V2Component[],
  id: string,
): { label: string; index: number; total: number } | null => {
  const topIndex = tree.findIndex((block) => block.id === id);
  if (topIndex !== -1) {
    return { label: blockLabel(tree[topIndex].type), index: topIndex, total: tree.length };
  }

  for (const block of tree) {
    if (block.type === "container") {
      const index = block.components.findIndex((child) => child.id === id);
      if (index !== -1) {
        return {
          label: blockLabel(block.components[index].type),
          index,
          total: block.components.length,
        };
      }
    }
  }

  return null;
};

const ComponentTreeBuilder: FC<ComponentTreeBuilderProps> = ({
  components,
  onChange,
  guildEmojis,
  budgetUsed,
  budgetMax,
  budgetReservedNote,
  disabled,
  topLevelMax = 10,
  availablePanels,
  allPanels,
  selectMenuModeOn,
}) => {
  const [announcement, setAnnouncement] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const activeBlock = activeId ? findBlock(components, activeId) : null;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const dragAnnouncements: Announcements = {
    onDragStart({ active }) {
      const info = describeBlock(components, String(active.id));
      if (!info) return undefined;
      return `Picked up ${info.label}. It is in position ${info.index + 1} of ${info.total}.`;
    },
    onDragOver({ active, over }) {
      if (!over) return undefined;
      const activeInfo = describeBlock(components, String(active.id));
      if (!activeInfo) return undefined;
      if (!sameList(components, String(active.id), String(over.id))) {
        return `${activeInfo.label} cannot be moved outside its current list.`;
      }
      const overInfo = describeBlock(components, String(over.id));
      if (!overInfo) return undefined;
      return `${activeInfo.label} was moved over position ${overInfo.index + 1} of ${overInfo.total}.`;
    },
    onDragEnd({ active, over }) {
      const activeInfo = describeBlock(components, String(active.id));
      if (!activeInfo) return undefined;
      if (!over || active.id === over.id) {
        return `${activeInfo.label} was dropped. No changes were made.`;
      }
      if (!sameList(components, String(active.id), String(over.id))) {
        return `${activeInfo.label} was returned to position ${activeInfo.index + 1} of ${activeInfo.total} because it cannot be moved outside its current list.`;
      }
      const overInfo = describeBlock(components, String(over.id));
      const targetPosition = overInfo ? overInfo.index + 1 : activeInfo.index + 1;
      return `Moved ${activeInfo.label} to position ${targetPosition} of ${activeInfo.total}.`;
    },
    onDragCancel({ active }) {
      const info = describeBlock(components, String(active.id));
      if (!info) return undefined;
      return `Dragging was cancelled. ${info.label} was returned to position ${info.index + 1} of ${info.total}.`;
    },
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);

    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeBlockId = String(active.id);
    const overId = String(over.id);

    // Guards the "no cross-list dragging" rule: a block can only be reordered within its own
    // sibling list (top level, or a single container's children), never dropped into the other.
    if (!sameList(components, activeBlockId, overId)) return;

    const overInfo = describeBlock(components, overId);
    if (!overInfo) return;

    onChange(moveBlockToIndex(components, activeBlockId, overInfo.index));
  };

  const handleDragCancel = () => {
    setActiveId(null);
  };

  return (
    <div>
      <ComponentBudgetMeter used={budgetUsed} max={budgetMax} reservedNote={budgetReservedNote} />
      <div className="mt-3">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis]}
          accessibility={{
            announcements: dragAnnouncements,
            screenReaderInstructions: {
              draggable:
                "To reorder, press space or enter to pick this block up. While dragging, use " +
                "the up and down arrow keys to move it, press space or enter again to drop it " +
                "in its new position, or press escape to cancel.",
            },
          }}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <BlockList
            blocks={components}
            tree={components}
            onTreeChange={onChange}
            guildEmojis={guildEmojis}
            nested={false}
            onAnnounce={setAnnouncement}
            disabled={disabled}
            budgetMax={budgetMax}
            topLevelMax={topLevelMax}
            availablePanels={availablePanels}
            allPanels={allPanels}
            selectMenuModeOn={selectMenuModeOn}
          />
          <DragOverlay>
            {activeBlock && (
              <div className="flex items-center gap-2 rounded-lg bg-gray-700 p-4 text-sm font-medium text-white shadow-lg ring-1 ring-gray-500">
                <FontAwesomeIcon
                  icon={BLOCK_ICONS[activeBlock.type]}
                  className="text-gray-400"
                  aria-hidden="true"
                />
                {blockLabel(activeBlock.type)}
              </div>
            )}
          </DragOverlay>
        </DndContext>
      </div>
      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>
    </div>
  );
};

export default ComponentTreeBuilder;
