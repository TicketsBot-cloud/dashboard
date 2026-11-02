import { useState, type FC } from "react";
import Textarea from "@/components/Textarea";
import { MAX_TEXT_CHARACTERS, blankTextError, type V2TextDisplay } from "@/lib/component-tree";

interface TextDisplayEditorProps {
  value: V2TextDisplay;
  onChange: (updated: V2TextDisplay) => void;
  saveAttempted?: boolean;
}

const TextDisplayEditor: FC<TextDisplayEditorProps> = ({
  value,
  onChange,
  saveAttempted = false,
}) => {
  const [touched, setTouched] = useState(false);

  return (
    <Textarea
      label="Text"
      value={value.content}
      max={MAX_TEXT_CHARACTERS}
      onChange={(content) => onChange({ ...value, content })}
      onBlur={() => setTouched(true)}
      error={saveAttempted || touched ? blankTextError(value.content) : undefined}
    />
  );
};

export default TextDisplayEditor;
