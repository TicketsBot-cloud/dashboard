import type { FC } from "react";
import ColourSelect from "@/components/ColourSelect";
import Slider from "@/components/Slider";
import { getTopLevelContainers, type V2Container, type V2Component } from "@/lib/component-tree";
import BlockList from "./BlockList";
import type { PickerPanel } from "./picker-panels";

interface ContainerEditorProps {
  value: V2Container;
  onChange: (updated: V2Container) => void;
  allowAvatarPlaceholder?: boolean;
  tree: V2Component[];
  onTreeChange: (next: V2Component[]) => void;
  onAnnounce: (message: string) => void;
  disabled?: boolean;
  budgetMax: number;
  availablePanels?: PickerPanel[];
  allPanels?: PickerPanel[];
  selectMenuModeOn?: boolean;
  saveAttempted?: boolean;
}

const ContainerEditor: FC<ContainerEditorProps> = ({
  value,
  onChange,
  allowAvatarPlaceholder,
  tree,
  onTreeChange,
  onAnnounce,
  disabled,
  budgetMax,
  availablePanels,
  allPanels,
  selectMenuModeOn,
  saveAttempted,
}) => {
  const containerLabel =
    getTopLevelContainers(tree).find((c) => c.id === value.id)?.label ?? "Container";

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-end">
        <div className="flex items-end gap-3">
          <Slider
            label="Accent colour"
            value={!!value.accentColor}
            disabled={disabled}
            onChange={(on) => onChange({ ...value, accentColor: on ? "#5865f2" : undefined })}
          />
          {value.accentColor && (
            <ColourSelect
              className="flex-1"
              value={value.accentColor}
              disabled={disabled}
              onChange={(accentColor) => onChange({ ...value, accentColor })}
            />
          )}
        </div>
        <Slider
          label="Spoiler"
          value={value.spoiler ?? false}
          disabled={disabled}
          onChange={(spoiler) => onChange({ ...value, spoiler })}
        />
      </div>
      <BlockList
        blocks={value.components}
        tree={tree}
        onTreeChange={onTreeChange}
        allowAvatarPlaceholder={allowAvatarPlaceholder}
        nested
        containerId={value.id}
        containerLabel={containerLabel}
        onAnnounce={onAnnounce}
        disabled={disabled}
        budgetMax={budgetMax}
        availablePanels={availablePanels}
        allPanels={allPanels}
        selectMenuModeOn={selectMenuModeOn}
        saveAttempted={saveAttempted}
      />
    </div>
  );
};

export default ContainerEditor;
