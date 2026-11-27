import type { FC } from "react";
import Slider from "@/components/Slider";
import Select from "@/components/Select";
import type { V2Separator } from "@/lib/component-tree";

interface SeparatorEditorProps {
  value: V2Separator;
  onChange: (updated: V2Separator) => void;
}

const SeparatorEditor: FC<SeparatorEditorProps> = ({ value, onChange }) => (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
    <Slider
      label="Show divider line"
      value={value.divider}
      onChange={(divider) => onChange({ ...value, divider })}
    />
    <Select
      label="Spacing"
      hideSearch
      options={[
        { label: "Small", key: "1" },
        { label: "Large", key: "2" },
      ]}
      value={String(value.spacing)}
      onChange={(spacing) => onChange({ ...value, spacing: spacing === "2" ? 2 : 1 })}
    />
  </div>
);

export default SeparatorEditor;
