import { useId, type FC } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus, faTrash, faImage, faLink, faTicket } from "@fortawesome/free-solid-svg-icons";
import Button from "@/components/Button";
import Select from "@/components/Select";
import TextInput from "@/components/TextInput";
import Textarea from "@/components/Textarea";
import Slider from "@/components/Slider";
import { useFocusAfterRemove } from "@/hooks/useFocusAfterRemove";
import { useTouchedFields } from "@/hooks/useTouchedFields";
import type { GuildEmoji } from "@/types";
import {
  MAX_ALT_TEXT_LENGTH,
  MAX_SECTION_TEXTS,
  MAX_TEXT_CHARACTERS,
  MAX_URL_LENGTH,
  blankTextError,
  linkLabelError,
  linkUrlError,
  mediaUrlError,
  type V2Section,
  type V2TextChild,
} from "@/lib/component-tree";
import PanelButtonTag from "./PanelButtonTag";

interface SectionEditorProps {
  value: V2Section;
  onChange: (updated: V2Section) => void;
  guildEmojis?: GuildEmoji[];
  /** Panels not yet placed in the tree, plus the one this accessory holds. Undefined hides panel placement. */
  availablePanels?: { panel_id: number; label: string; emoji?: string }[];
  saveAttempted?: boolean;
}

const SectionEditor: FC<SectionEditorProps> = ({
  value,
  onChange,
  availablePanels,
  saveAttempted = false,
}) => {
  const hintId = useId();
  const { shows, touch } = useTouchedFields(saveAttempted);
  const { targetRef: addTextRef, request: focusAddText } = useFocusAfterRemove<HTMLButtonElement>();
  const { targetRef: firstAccessoryRef, request: focusAccessoryChoices } =
    useFocusAfterRemove<HTMLButtonElement>();
  const updateText = (index: number, content: string) => {
    const components = value.components.map((c, i) => (i === index ? { ...c, content } : c));
    onChange({ ...value, components });
  };

  const removeText = (index: number) => {
    focusAddText();
    onChange({ ...value, components: value.components.filter((_, i) => i !== index) });
  };

  const addText = () => {
    if (value.components.length >= MAX_SECTION_TEXTS) return;
    const newChild: V2TextChild = { id: crypto.randomUUID(), content: "" };
    onChange({ ...value, components: [...value.components, newChild] });
  };

  const thumbnailAccessory = value.accessory?.kind === "thumbnail" ? value.accessory : undefined;
  const linkButtonAccessory = value.accessory?.kind === "link_button" ? value.accessory : undefined;
  const panelButtonAccessory =
    value.accessory?.kind === "panel_button" ? value.accessory : undefined;

  return (
    <div className="flex flex-col gap-3">
      {value.components.map((child, i) => (
        <div key={child.id} className="flex items-start gap-2">
          <Textarea
            label={`Text #${i + 1}`}
            value={child.content}
            max={MAX_TEXT_CHARACTERS}
            onChange={(content) => updateText(i, content)}
            onBlur={() => touch(`${child.id}:text`)}
            error={shows(`${child.id}:text`) ? blankTextError(child.content) : undefined}
            className="flex-1"
          />
          <Button
            variant="ghost"
            size="icon"
            title={`Remove text ${i + 1}`}
            aria-label={`Remove text ${i + 1}`}
            onClick={() => removeText(i)}
            className="mt-6 text-red-300 hover:text-red-200"
          >
            <FontAwesomeIcon icon={faTrash} aria-hidden="true" />
          </Button>
        </div>
      ))}
      <div className="flex items-center gap-3">
        <Button
          ref={addTextRef}
          variant="dashed"
          onClick={addText}
          disabled={value.components.length >= MAX_SECTION_TEXTS}
          className="text-sm font-medium w-fit"
        >
          <FontAwesomeIcon icon={faPlus} /> Add text
        </Button>
        <span className="text-xs">
          {value.components.length}/{MAX_SECTION_TEXTS} texts
        </span>
      </div>

      {!value.accessory && (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            ref={firstAccessoryRef}
            variant="dashed"
            className="w-fit text-sm font-medium"
            onClick={() => onChange({ ...value, accessory: { kind: "thumbnail", url: "" } })}
          >
            <FontAwesomeIcon icon={faImage} /> Image
          </Button>
          <Button
            variant="dashed"
            className="w-fit text-sm font-medium"
            onClick={() =>
              onChange({ ...value, accessory: { kind: "link_button", label: "", url: "" } })
            }
          >
            <FontAwesomeIcon icon={faLink} /> Link button
          </Button>
          {availablePanels !== undefined && (
            <Button
              variant="dashed"
              className="w-fit text-sm font-medium"
              visuallyDisabled={availablePanels.length === 0}
              aria-describedby={availablePanels.length === 0 ? hintId : undefined}
              title={
                availablePanels.length === 0 ? "All panels are already placed elsewhere" : undefined
              }
              onClick={() => {
                const panelId = availablePanels[0]?.panel_id;
                if (panelId === undefined) return;
                onChange({ ...value, accessory: { kind: "panel_button", panel_id: panelId } });
              }}
            >
              <FontAwesomeIcon icon={faTicket} /> Panel button
            </Button>
          )}
          {availablePanels !== undefined && availablePanels.length === 0 && (
            <span id={hintId} className="sr-only">
              All panels are already placed elsewhere
            </span>
          )}
        </div>
      )}

      {thumbnailAccessory && (
        <div className="p-3 rounded bg-gray-600 flex flex-col gap-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 grid gap-2 grid-cols-1 md:grid-cols-2">
              <TextInput
                label="Image URL"
                value={thumbnailAccessory.url}
                onChange={(url) =>
                  onChange({ ...value, accessory: { ...thumbnailAccessory, url } })
                }
                onBlur={() => touch("accessory:url")}
                maxLength={MAX_URL_LENGTH}
                error={shows("accessory:url") ? mediaUrlError(thumbnailAccessory.url) : undefined}
              />
              <TextInput
                label="Alt text (optional)"
                maxLength={MAX_ALT_TEXT_LENGTH}
                value={thumbnailAccessory.description || ""}
                onChange={(description) =>
                  onChange({
                    ...value,
                    accessory: { ...thumbnailAccessory, description: description || undefined },
                  })
                }
              />
            </div>
            <Button
              variant="ghost"
              size="icon"
              title="Remove side image"
              aria-label="Remove side image"
              onClick={() => {
                focusAccessoryChoices();
                onChange({ ...value, accessory: undefined });
              }}
              className="mt-6 text-red-300 hover:text-red-200"
            >
              <FontAwesomeIcon icon={faTrash} aria-hidden="true" />
            </Button>
          </div>
          <Slider
            label="Spoiler"
            value={thumbnailAccessory.spoiler ?? false}
            onChange={(spoiler) =>
              onChange({ ...value, accessory: { ...thumbnailAccessory, spoiler } })
            }
          />
        </div>
      )}

      {linkButtonAccessory && (
        <div className="p-3 rounded bg-gray-600 flex flex-col gap-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 grid gap-2 grid-cols-1 md:grid-cols-2">
              <TextInput
                label="Button label"
                value={linkButtonAccessory.label}
                onChange={(label) =>
                  onChange({ ...value, accessory: { ...linkButtonAccessory, label } })
                }
                onBlur={() => touch("accessory:label")}
                maxLength={80}
                error={
                  shows("accessory:label") ? linkLabelError(linkButtonAccessory.label) : undefined
                }
              />
              <TextInput
                label="URL"
                value={linkButtonAccessory.url}
                onChange={(url) =>
                  onChange({ ...value, accessory: { ...linkButtonAccessory, url } })
                }
                onBlur={() => touch("accessory:linkurl")}
                maxLength={MAX_URL_LENGTH}
                error={
                  shows("accessory:linkurl") ? linkUrlError(linkButtonAccessory.url) : undefined
                }
              />
            </div>
            <Button
              variant="ghost"
              size="icon"
              title="Remove link button"
              aria-label="Remove link button"
              onClick={() => {
                focusAccessoryChoices();
                onChange({ ...value, accessory: undefined });
              }}
              className="mt-6 text-red-300 hover:text-red-200"
            >
              <FontAwesomeIcon icon={faTrash} aria-hidden="true" />
            </Button>
          </div>
        </div>
      )}

      {panelButtonAccessory && (
        <div className="p-3 rounded bg-gray-600 flex flex-col gap-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 flex items-center gap-2">
              <Select
                className="flex-1"
                label="Ticket panel"
                hideLabel
                placeholder="Select a panel..."
                value={String(panelButtonAccessory.panel_id)}
                options={(availablePanels ?? []).map((p) => ({
                  key: String(p.panel_id),
                  label: p.label,
                }))}
                onChange={(key) => {
                  if (key === null) return;
                  onChange({
                    ...value,
                    accessory: { ...panelButtonAccessory, panel_id: Number(key) },
                  });
                }}
              />
              <PanelButtonTag />
            </div>
            <Button
              variant="ghost"
              size="icon"
              title="Remove panel button"
              aria-label="Remove panel button"
              onClick={() => {
                focusAccessoryChoices();
                onChange({ ...value, accessory: undefined });
              }}
              className="text-red-300 hover:text-red-200"
            >
              <FontAwesomeIcon icon={faTrash} aria-hidden="true" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SectionEditor;
