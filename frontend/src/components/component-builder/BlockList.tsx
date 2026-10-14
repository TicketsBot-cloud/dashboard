import type { FC } from "react";
import {
  faLayerGroup,
  faColumns,
  faMinus,
  faFont,
  faImages,
  faLink,
  faTicket,
} from "@fortawesome/free-solid-svg-icons";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import type { GuildEmoji } from "@/types";
import {
  addBlockAtTop,
  addBlockToContainer,
  blockLabel,
  countBlocks,
  createEmptyBlock,
  getTopLevelContainers,
  moveBlock,
  moveBlockIntoContainer,
  moveBlockOutOfContainer,
  removeBlock,
  updateBlock,
  type V2Component,
  type V2ComponentType,
} from "@/lib/component-tree";
import { pendingBlockFocus } from "@/lib/block-focus";
import BlockShell from "./BlockShell";
import AddBlockMenu from "./AddBlockMenu";
import ContainerEditor from "./ContainerEditor";
import SectionEditor from "./SectionEditor";
import TextDisplayEditor from "./TextDisplayEditor";
import MediaGalleryEditor from "./MediaGalleryEditor";
import SeparatorEditor from "./SeparatorEditor";
import ButtonRowEditor from "./ButtonRowEditor";

export const BLOCK_ICONS: Record<V2ComponentType, IconDefinition> = {
  container: faLayerGroup,
  section: faColumns,
  separator: faMinus,
  text_display: faFont,
  media_gallery: faImages,
  button_row: faLink,
  panel_select: faTicket,
};

type AvailablePanel = { panel_id: number; label: string; emoji?: string };

/** The pickable panels for one block: the unplaced ones plus whichever the block already holds. */
const withOwnSelection = (
  available: AvailablePanel[],
  allPanels: AvailablePanel[],
  ownPanelIds: number[],
): AvailablePanel[] => {
  const uniqueOwnPanelIds = [...new Set(ownPanelIds)];
  const missing = uniqueOwnPanelIds.filter((id) => !available.some((p) => p.panel_id === id));
  if (missing.length === 0) return available;
  const additions = missing
    .map((id) => allPanels.find((p) => p.panel_id === id))
    .filter((p): p is AvailablePanel => p !== undefined);
  return additions.length > 0 ? [...available, ...additions] : available;
};

const PanelSelectSummary: FC<{ availablePanels?: AvailablePanel[] }> = ({ availablePanels }) => {
  const names = (availablePanels ?? []).map((p) => p.label);
  if (names.length === 0) {
    return (
      <p className="text-sm text-gray-300">
        No panels remaining - place a panel button elsewhere to remove one from here, or delete this
        block.
      </p>
    );
  }
  const fullList = names.join(", ");
  return (
    <p className="min-w-0 truncate text-sm text-gray-300" title={fullList}>
      Contains: {fullList}
    </p>
  );
};

interface BlockListProps {
  blocks: V2Component[];
  tree: V2Component[];
  onTreeChange: (next: V2Component[]) => void;
  guildEmojis: GuildEmoji[];
  nested: boolean;
  containerId?: string;
  containerLabel?: string;
  onAnnounce: (message: string) => void;
  disabled?: boolean;
  budgetMax: number;
  /** Panels not yet placed in the tree. Undefined means no panel placement UI at all. */
  availablePanels?: AvailablePanel[];
  /** Every panel in the multi-panel, so a block can look up the panel it already holds. */
  allPanels?: AvailablePanel[];
  selectMenuModeOn?: boolean;
  saveAttempted?: boolean;
}

const BlockList: FC<BlockListProps> = ({
  blocks,
  tree,
  onTreeChange,
  guildEmojis,
  nested,
  containerId,
  containerLabel,
  onAnnounce,
  disabled,
  budgetMax,
  availablePanels,
  allPanels,
  selectMenuModeOn,
  saveAttempted,
}) => {
  const topLevelContainers = nested ? [] : getTopLevelContainers(tree);
  const budgetExhausted = countBlocks(tree) >= budgetMax;
  const canAddMore = !disabled && !budgetExhausted;

  return (
    <div>
      {blocks.map((block, index) => {
        const canMoveUp = index > 0;
        const canMoveDown = index < blocks.length - 1;
        const label = blockLabel(block.type);
        const shellLabel =
          blocks.length > 1 ? `${label} (${index + 1} of ${blocks.length})` : label;

        const handleMove = (direction: "up" | "down") => {
          onTreeChange(moveBlock(tree, block.id, direction));
          const newPosition = direction === "up" ? index : index + 2;
          onAnnounce(`Moved ${label} ${direction} to position ${newPosition} of ${blocks.length}`);
        };

        const handleMoveIntoContainer = (targetContainerId: string) => {
          const target = topLevelContainers.find((c) => c.id === targetContainerId);
          pendingBlockFocus.id = block.id;
          onTreeChange(moveBlockIntoContainer(tree, block.id, targetContainerId));
          onAnnounce(`Moved ${label} into ${target?.label ?? "container"}`);
        };

        const handleMoveOutOfContainer = () => {
          pendingBlockFocus.id = block.id;
          onTreeChange(moveBlockOutOfContainer(tree, block.id));
          onAnnounce(`Moved ${label} out of ${containerLabel ?? "container"} to top level`);
        };

        const handleDelete = () => {
          pendingBlockFocus.id = (blocks[index + 1] ?? blocks[index - 1])?.id ?? null;
          onTreeChange(removeBlock(tree, block.id));
          onAnnounce(`Deleted ${label}`);
        };

        const handleUpdate = (updated: V2Component) =>
          onTreeChange(updateBlock(tree, block.id, () => updated));

        return (
          <BlockShell
            key={block.id}
            blockId={block.id}
            label={shellLabel}
            containerLabel={nested ? containerLabel : undefined}
            icon={BLOCK_ICONS[block.type]}
            canMoveUp={canMoveUp}
            canMoveDown={canMoveDown}
            onMoveUp={() => handleMove("up")}
            onMoveDown={() => handleMove("down")}
            moveIntoContainerTargets={
              !nested && block.type !== "container" ? topLevelContainers : undefined
            }
            onMoveIntoContainer={handleMoveIntoContainer}
            canMoveOutOfContainer={nested}
            onMoveOutOfContainer={handleMoveOutOfContainer}
            onDelete={handleDelete}
            nested={nested}
            disabled={disabled}
          >
            {block.type === "container" && (
              <ContainerEditor
                value={block}
                onChange={handleUpdate}
                guildEmojis={guildEmojis}
                tree={tree}
                onTreeChange={onTreeChange}
                onAnnounce={onAnnounce}
                disabled={disabled}
                budgetMax={budgetMax}
                availablePanels={availablePanels}
                allPanels={allPanels}
                selectMenuModeOn={selectMenuModeOn}
                saveAttempted={saveAttempted}
              />
            )}
            {block.type === "section" && (
              <SectionEditor
                value={block}
                onChange={handleUpdate}
                saveAttempted={saveAttempted}
                guildEmojis={guildEmojis}
                availablePanels={
                  availablePanels && allPanels && block.accessory?.kind === "panel_button"
                    ? withOwnSelection(availablePanels, allPanels, [block.accessory.panel_id])
                    : availablePanels
                }
              />
            )}
            {block.type === "text_display" && (
              <TextDisplayEditor
                value={block}
                onChange={handleUpdate}
                saveAttempted={saveAttempted}
              />
            )}
            {block.type === "media_gallery" && (
              <MediaGalleryEditor
                value={block}
                onChange={handleUpdate}
                saveAttempted={saveAttempted}
              />
            )}
            {block.type === "separator" && (
              <SeparatorEditor value={block} onChange={handleUpdate} />
            )}
            {block.type === "button_row" && (
              <ButtonRowEditor
                value={block}
                onChange={handleUpdate}
                saveAttempted={saveAttempted}
                availablePanels={
                  availablePanels && allPanels
                    ? withOwnSelection(
                        availablePanels,
                        allPanels,
                        block.buttons.filter((b) => b.kind === "panel").map((b) => b.panel_id),
                      )
                    : availablePanels
                }
              />
            )}
            {block.type === "panel_select" && (
              <PanelSelectSummary availablePanels={availablePanels} />
            )}
          </BlockShell>
        );
      })}
      {canAddMore && (
        <AddBlockMenu
          exclude={nested ? ["container"] : []}
          tree={tree}
          availablePanels={availablePanels}
          selectMenuModeOn={selectMenuModeOn}
          containerLabel={nested ? containerLabel : undefined}
          onAdd={(type) => {
            const newBlock = createEmptyBlock(type);
            const next =
              nested && containerId
                ? addBlockToContainer(tree, containerId, newBlock)
                : addBlockAtTop(tree, newBlock);
            // Taking the last slot unmounts every Add block trigger, so focus would otherwise be lost.
            if (countBlocks(next) >= budgetMax) pendingBlockFocus.id = newBlock.id;
            onTreeChange(next);
            onAnnounce(`Added ${blockLabel(type)}${containerLabel ? ` to ${containerLabel}` : ""}`);
          }}
        />
      )}
    </div>
  );
};

export default BlockList;
