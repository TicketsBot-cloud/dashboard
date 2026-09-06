import type { FC } from "react";
import Button from "@/components/Button";
import ColourSelect from "@/components/ColourSelect";
import Slider from "@/components/Slider";
import type { GuildEmoji } from "@/types";
import { getTopLevelContainers, type V2Container, type V2Component } from "@/lib/component-tree";
import BlockList from "./BlockList";

interface ContainerEditorProps {
  value: V2Container;
  onChange: (updated: V2Container) => void;
  guildEmojis?: GuildEmoji[];
  tree: V2Component[];
  onTreeChange: (next: V2Component[]) => void;
  onAnnounce: (message: string) => void;
  disabled?: boolean;
  budgetMax: number;
  /** Threaded straight through to the nested BlockList - see BlockList's prop of the same name. */
  availablePanels?: { panel_id: number; label: string; emoji?: string }[];
  /** Threaded straight through to the nested BlockList - see BlockList's prop of the same name. */
  allPanels?: { panel_id: number; label: string; emoji?: string }[];
  /** Threaded straight through to the nested BlockList - see BlockList's prop of the same name. */
  selectMenuModeOn?: boolean;
}

const ContainerEditor: FC<ContainerEditorProps> = ({
  value,
  onChange,
  guildEmojis = [],
  tree,
  onTreeChange,
  onAnnounce,
  disabled,
  budgetMax,
  availablePanels,
  allPanels,
  selectMenuModeOn,
}) => {
  const containerLabel =
    getTopLevelContainers(tree).find((c) => c.id === value.id)?.label ?? "Container";

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-end">
        <ColourSelect
          label="Accent colour"
          value={value.accentColor || "#5865f2"}
          disabled={disabled}
          onChange={(accentColor) => onChange({ ...value, accentColor })}
        />
        <div className="flex items-center gap-3">
          {value.accentColor && (
            <Button
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={() => onChange({ ...value, accentColor: undefined })}
            >
              Clear
            </Button>
          )}
          <Slider
            label="Spoiler"
            value={value.spoiler ?? false}
            disabled={disabled}
            onChange={(spoiler) => onChange({ ...value, spoiler })}
          />
        </div>
      </div>
      <BlockList
        blocks={value.components}
        tree={tree}
        onTreeChange={onTreeChange}
        guildEmojis={guildEmojis}
        nested
        containerId={value.id}
        containerLabel={containerLabel}
        onAnnounce={onAnnounce}
        disabled={disabled}
        budgetMax={budgetMax}
        topLevelMax={Infinity}
        availablePanels={availablePanels}
        allPanels={allPanels}
        selectMenuModeOn={selectMenuModeOn}
      />
    </div>
  );
};

export default ContainerEditor;
