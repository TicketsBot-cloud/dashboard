import type { FC } from "react";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
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

/**
 * Builds the panel list a single block's picker should see: the globally-available (unplaced)
 * panels, plus whichever panel(s) this specific block already has selected. `getPlacedPanelIds`
 * (computed once for the whole tree) has no way to know that a placement "occupies" itself, so a
 * button/accessory that already points at panel 7 finds panel 7 missing from `available` purely
 * because it is the one holding it. Without adding it back in here, that control's `Select` would
 * render as unset even though `panel_id` is genuinely still populated in the data.
 *
 * Looks up the missing panel(s) in `allPanels` (the full, unfiltered list) rather than fabricating
 * an entry, so the label/emoji shown match the guild's real panel data. If a panel_id isn't found
 * in `allPanels` either - an inconsistent-state edge case - it's silently skipped rather than
 * crashing or adding a placeholder.
 */
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

/**
 * A panel_select block has no fields of its own - it always binds every currently-unplaced
 * panel, which is exactly what `availablePanels` already represents by the caller's contract
 * (see the doc comment on the `availablePanels` prop below). Renders a single-line summary of
 * which panels that currently is, matching the truncate + full-list-in-title pattern
 * MultiSelect.tsx uses for its own "list of N items, may overflow" chip row.
 */
const PanelSelectSummary: FC<{ availablePanels?: AvailablePanel[] }> = ({ availablePanels }) => {
  const names = (availablePanels ?? []).map((p) => p.label);
  if (names.length === 0) {
    return (
      <p className="text-sm text-gray-400">
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
  /** Overall Discord component budget (30 minus whatever the backend reserves). */
  budgetMax: number;
  /** Top-level slot budget (10 minus reserved), only enforced for the non-nested list. */
  topLevelMax: number;
  /**
   * Panels not yet placed elsewhere in the tree (per `getPlacedPanelIds`), threaded down to
   * every panel-placement control the same way `guildEmojis` already is. Undefined means this
   * builder is being used somewhere with no "panels" concept at all (single-panel or
   * welcome-message message), in which case no panel-placement UI renders anywhere below.
   */
  availablePanels?: AvailablePanel[];
  /**
   * The full, unfiltered panel list for this multipanel (same undefined-means-no-panels-concept
   * convention as `availablePanels`). Needed alongside `availablePanels` so a block that already
   * holds a placement can look up that panel's label/emoji even though it's excluded from the
   * globally-available list for being placed by that very block - see `withOwnSelection`.
   */
  allPanels?: AvailablePanel[];
  /** The multipanel's own "dropdown mode" toggle - see AddBlockMenu's prop of the same name. */
  selectMenuModeOn?: boolean;
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
  topLevelMax,
  availablePanels,
  allPanels,
  selectMenuModeOn,
}) => {
  const topLevelContainers = nested ? [] : getTopLevelContainers(tree);
  const budgetExhausted = countBlocks(tree) >= budgetMax;
  const topLevelExhausted = !nested && blocks.length >= topLevelMax;
  const canAddMore = !disabled && !budgetExhausted && !topLevelExhausted;

  return (
    <div>
      <SortableContext
        items={blocks.map((block) => block.id)}
        strategy={verticalListSortingStrategy}
      >
        {blocks.map((block, index) => {
          const canMoveUp = index > 0;
          const canMoveDown = index < blocks.length - 1;
          const label = blockLabel(block.type);
          // Distinguishes same-type blocks for assistive tech (e.g. two Text Displays both
          // named "Text Display" would otherwise share identical control names).
          const shellLabel =
            blocks.length > 1 ? `${label} (${index + 1} of ${blocks.length})` : label;

          const handleMove = (direction: "up" | "down") => {
            onTreeChange(moveBlock(tree, block.id, direction));
            const newPosition = direction === "up" ? index : index + 2;
            onAnnounce(
              `Moved ${label} ${direction} to position ${newPosition} of ${blocks.length}`,
            );
          };

          const handleMoveIntoContainer = (targetContainerId: string) => {
            const target = topLevelContainers.find((c) => c.id === targetContainerId);
            onTreeChange(moveBlockIntoContainer(tree, block.id, targetContainerId));
            onAnnounce(`Moved ${label} into ${target?.label ?? "container"}`);
          };

          const handleMoveOutOfContainer = () => {
            onTreeChange(moveBlockOutOfContainer(tree, block.id));
            onAnnounce(`Moved ${label} out of ${containerLabel ?? "container"} to top level`);
          };

          const handleDelete = () => {
            onTreeChange(removeBlock(tree, block.id));
            onAnnounce(`Deleted ${label}`);
          };

          const handleUpdate = (updated: V2Component) =>
            onTreeChange(updateBlock(tree, block.id, () => updated));

          return (
            <BlockShell
              key={block.id}
              id={block.id}
              label={shellLabel}
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
                />
              )}
              {block.type === "section" && (
                <SectionEditor
                  value={block}
                  onChange={handleUpdate}
                  guildEmojis={guildEmojis}
                  availablePanels={
                    availablePanels && allPanels && block.accessory?.kind === "panel_button"
                      ? withOwnSelection(availablePanels, allPanels, [block.accessory.panel_id])
                      : availablePanels
                  }
                />
              )}
              {block.type === "text_display" && (
                <TextDisplayEditor value={block} onChange={handleUpdate} />
              )}
              {block.type === "media_gallery" && (
                <MediaGalleryEditor value={block} onChange={handleUpdate} />
              )}
              {block.type === "separator" && (
                <SeparatorEditor value={block} onChange={handleUpdate} />
              )}
              {block.type === "button_row" && (
                <ButtonRowEditor
                  value={block}
                  onChange={handleUpdate}
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
      </SortableContext>
      {canAddMore && (
        <AddBlockMenu
          exclude={nested ? ["container"] : []}
          tree={tree}
          availablePanels={availablePanels}
          selectMenuModeOn={selectMenuModeOn}
          onAdd={(type) => {
            const newBlock = createEmptyBlock(type);
            onTreeChange(
              nested && containerId
                ? addBlockToContainer(tree, containerId, newBlock)
                : addBlockAtTop(tree, newBlock),
            );
            onAnnounce(`Added ${blockLabel(type)}${containerLabel ? ` to ${containerLabel}` : ""}`);
          }}
        />
      )}
    </div>
  );
};

export default BlockList;
