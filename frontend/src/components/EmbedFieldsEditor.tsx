import type { FC } from "react";
import Button from "@/components/Button";
import TextInput from "@/components/TextInput";
import Textarea from "@/components/Textarea";
import Slider from "@/components/Slider";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus, faTrash } from "@fortawesome/free-solid-svg-icons";
import { EMBED_LIMITS } from "@/constants/embedLimits";

interface EmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

interface EmbedFieldsEditorProps {
  fields: EmbedField[];
  onChange: (fields: EmbedField[]) => void;
}

const EmbedFieldsEditor: FC<EmbedFieldsEditorProps> = ({ fields, onChange }) => {
  const updateField = (index: number, update: Partial<EmbedField>) => {
    const next = fields.map((f, i) => (i === index ? { ...f, ...update } : f));
    onChange(next);
  };

  const removeField = (index: number) => {
    onChange(fields.filter((_, i) => i !== index));
  };

  const addField = () => {
    if (fields.length >= EMBED_LIMITS.FIELDS) return;
    onChange([...fields, { name: "", value: "", inline: false }]);
  };

  return (
    <div className="flex flex-col gap-4">
      {fields.map((field, i) => (
        <div key={i} className="p-3 rounded bg-gray-800 flex flex-col gap-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 grid gap-2 grid-cols-1 md:grid-cols-2">
              <TextInput
                label="Field Name"
                placeholder="Field name"
                value={field.name}
                onChange={(v) => updateField(i, { name: v })}
                maxLength={EMBED_LIMITS.FIELD_NAME}
                showCount
              />
              <Textarea
                label="Field Value"
                value={field.value}
                onChange={(v) => updateField(i, { value: v })}
                max={EMBED_LIMITS.FIELD_VALUE}
              />
            </div>
            <Button
              variant="ghost"
              size="icon"
              title="Remove field"
              onClick={() => removeField(i)}
              className="mt-6 text-red-400 hover:text-red-300"
            >
              <FontAwesomeIcon icon={faTrash} />
            </Button>
          </div>
          <Slider
            label="Inline"
            value={field.inline ?? false}
            onChange={(v) => updateField(i, { inline: v })}
          />
        </div>
      ))}
      <div className="flex items-center gap-3">
        <Button
          variant="secondary"
          onClick={addField}
          disabled={fields.length >= EMBED_LIMITS.FIELDS}
          className="text-sm font-medium w-fit"
        >
          <FontAwesomeIcon icon={faPlus} /> Add Field
        </Button>
        <span className="text-xs">
          {fields.length}/{EMBED_LIMITS.FIELDS} fields
        </span>
      </div>
    </div>
  );
};

export default EmbedFieldsEditor;
