import type { FC } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus, faTrash } from "@fortawesome/free-solid-svg-icons";
import Button from "@/components/Button";
import TextInput from "@/components/TextInput";
import Slider from "@/components/Slider";
import { useFocusAfterRemove } from "@/hooks/useFocusAfterRemove";
import { useTouchedFields } from "@/hooks/useTouchedFields";
import {
  MAX_ALT_TEXT_LENGTH,
  MAX_GALLERY_ITEMS,
  MAX_URL_LENGTH,
  mediaUrlError,
  type V2MediaGallery,
  type V2MediaGalleryItem,
} from "@/lib/component-tree";

interface MediaGalleryEditorProps {
  value: V2MediaGallery;
  onChange: (updated: V2MediaGallery) => void;
  saveAttempted?: boolean;
}

const MediaGalleryEditor: FC<MediaGalleryEditorProps> = ({
  value,
  onChange,
  saveAttempted = false,
}) => {
  const { shows, touch } = useTouchedFields(saveAttempted);
  const { targetRef: addRef, request: focusAddButton } = useFocusAfterRemove<HTMLButtonElement>();
  const updateItem = (index: number, update: Partial<V2MediaGalleryItem>) => {
    const items = value.items.map((item, i) => (i === index ? { ...item, ...update } : item));
    onChange({ ...value, items });
  };

  const removeItem = (index: number) => {
    focusAddButton();
    onChange({ ...value, items: value.items.filter((_, i) => i !== index) });
  };

  const addItem = () => {
    if (value.items.length >= MAX_GALLERY_ITEMS) return;
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
                onBlur={() => touch(`${i}:url`)}
                maxLength={MAX_URL_LENGTH}
                error={shows(`${i}:url`) ? mediaUrlError(item.url) : undefined}
              />
              <TextInput
                label="Alt text (optional)"
                maxLength={MAX_ALT_TEXT_LENGTH}
                value={item.description || ""}
                onChange={(description) => updateItem(i, { description: description || undefined })}
              />
            </div>
            <Button
              variant="ghost"
              size="icon"
              title={`Remove image ${i + 1}`}
              aria-label={`Remove image ${i + 1}`}
              onClick={() => removeItem(i)}
              className="mt-6 text-red-300 hover:text-red-200"
            >
              <FontAwesomeIcon icon={faTrash} aria-hidden="true" />
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
          ref={addRef}
          variant="secondary"
          onClick={addItem}
          disabled={value.items.length >= MAX_GALLERY_ITEMS}
          className="text-sm font-medium w-fit"
        >
          <FontAwesomeIcon icon={faPlus} /> Add item
        </Button>
        <span className="text-xs">
          {value.items.length}/{MAX_GALLERY_ITEMS} items
        </span>
      </div>
    </div>
  );
};

export default MediaGalleryEditor;
