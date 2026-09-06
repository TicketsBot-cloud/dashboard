import type { FC } from "react";
import Textarea from "@/components/Textarea";
import { EMBED_LIMITS } from "@/constants/embedLimits";
import type { V2TextDisplay } from "@/lib/component-tree";

interface TextDisplayEditorProps {
  value: V2TextDisplay;
  onChange: (updated: V2TextDisplay) => void;
}

const TextDisplayEditor: FC<TextDisplayEditorProps> = ({ value, onChange }) => (
  <Textarea
    label="Text"
    value={value.content}
    max={EMBED_LIMITS.DESCRIPTION}
    onChange={(content) => onChange({ ...value, content })}
  />
);

export default TextDisplayEditor;
