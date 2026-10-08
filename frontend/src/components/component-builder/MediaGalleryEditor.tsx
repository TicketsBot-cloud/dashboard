import type { FC } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus, faTrash } from "@fortawesome/free-solid-svg-icons";
import Button from "@/components/Button";
import TextInput from "@/components/TextInput";
import Slider from "@/components/Slider";
import { EMBED_LIMITS } from "@/constants/embedLimits";
import type { V2MediaGallery, V2MediaGalleryItem } from "@/lib/component-tree";

const MAX_ITEMS = 10;

interface MediaGalleryEditorProps {
  value: V2MediaGallery;
  onChange: (updated: V2MediaGallery) => void;
}

const MediaGalleryEditor: FC<MediaGalleryEditorProps> = ({ value, onChange }) => {
  const updateItem = (index: number, update: Partial<V2MediaGalleryItem>) => {
    const items = value.items.map((item, i) => (i === index ? { ...item, ...update } : item));
    onChange({ ...value, items });
  };

  const removeItem = (index: number) => {
    onChange({ ...value, items: value.items.filter((_, i) => i !== index) });
  };

  const addItem = () => {
    if (value.items.length >= MAX_ITEMS) return;
    onChange({ ...value, items: [...value.items, { url: "" }] });
  };

  return (
    <div className="flex flex-col gap-3">
      {value.items.map((item, i) => (
        <div key={i} className="p-3 rounded bg-gray-600 flex flex-col gap-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 grid gap-2 grid-cols-1 md:grid-cols-2">
              <TextInput
                label="Image URL"
                value={item.url}
                onChange={(url) => updateItem(i, { url })}
                maxLength={EMBED_LIMITS.URL}
              />
              <TextInput
                label="Alt text (optional)"
                value={item.description || ""}
                onChange={(description) => updateItem(i, { description: description || undefined })}
              />
            </div>
            <Button
              variant="ghost"
              size="icon"
              title="Remove item"
              onClick={() => removeItem(i)}
              className="mt-6 text-red-400 hover:text-red-300"
            >
              <FontAwesomeIcon icon={faTrash} />
            </Button>
          </div>
          <Slider
            label="Spoiler"
            value={item.spoiler ?? false}
            onChange={(spoiler) => updateItem(i, { spoiler })}
          />
        </div>
      ))}
      <div className="flex items-center gap-3">
        <Button
          variant="secondary"
          onClick={addItem}
          disabled={value.items.length >= MAX_ITEMS}
          className="text-sm font-medium w-fit"
        >
          <FontAwesomeIcon icon={faPlus} /> Add item
        </Button>
        <span className="text-xs">
          {value.items.length}/{MAX_ITEMS} items
        </span>
      </div>
    </div>
  );
};

export default MediaGalleryEditor;
