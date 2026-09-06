import type { FC } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus, faTrash, faImage, faLink, faTicket } from "@fortawesome/free-solid-svg-icons";
import Button from "@/components/Button";
import Select from "@/components/Select";
import TextInput from "@/components/TextInput";
import Textarea from "@/components/Textarea";
import Slider from "@/components/Slider";
import { EMBED_LIMITS } from "@/constants/embedLimits";
import { isSafeUrl } from "@/lib/url";
import type { GuildEmoji } from "@/types";
import type { V2Section, V2TextChild } from "@/lib/component-tree";
import PanelButtonTag from "./PanelButtonTag";

const MAX_TEXTS = 3;

interface SectionEditorProps {
  value: V2Section;
  onChange: (updated: V2Section) => void;
  guildEmojis?: GuildEmoji[];
  /**
   * Panels not yet placed elsewhere in the tree (plus, if this section's accessory already
   * points at a panel, that panel's own entry - the caller's responsibility). Undefined means
   * no "panels" concept applies here (single-panel/welcome-message builder), so the "Panel
   * button" accessory option is omitted entirely.
   */
  availablePanels?: { panel_id: number; label: string; emoji?: string }[];
}

const SectionEditor: FC<SectionEditorProps> = ({ value, onChange, availablePanels }) => {
  const updateText = (index: number, content: string) => {
    const components = value.components.map((c, i) => (i === index ? { ...c, content } : c));
    onChange({ ...value, components });
  };

  const removeText = (index: number) => {
    onChange({ ...value, components: value.components.filter((_, i) => i !== index) });
  };

  const addText = () => {
    if (value.components.length >= MAX_TEXTS) return;
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
            max={EMBED_LIMITS.DESCRIPTION}
            onChange={(content) => updateText(i, content)}
            className="flex-1"
          />
          <Button
            variant="ghost"
            size="icon"
            title="Remove text"
            onClick={() => removeText(i)}
            className="mt-6 text-red-400 hover:text-red-300"
          >
            <FontAwesomeIcon icon={faTrash} />
          </Button>
        </div>
      ))}
      <div className="flex items-center gap-3">
        <Button
          variant="dashed"
          onClick={addText}
          disabled={value.components.length >= MAX_TEXTS}
          className="text-sm font-medium w-fit"
        >
          <FontAwesomeIcon icon={faPlus} /> Add text
        </Button>
        <span className="text-xs">
          {value.components.length}/{MAX_TEXTS} texts
        </span>
      </div>

      {!value.accessory && (
        <div className="flex flex-wrap items-center gap-3">
          <Button
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
                maxLength={EMBED_LIMITS.URL}
              />
              <TextInput
                label="Alt text (optional)"
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
              onClick={() => onChange({ ...value, accessory: undefined })}
              className="mt-6 text-red-400 hover:text-red-300"
            >
              <FontAwesomeIcon icon={faTrash} />
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
                maxLength={80}
              />
              <TextInput
                label="URL"
                value={linkButtonAccessory.url}
                onChange={(url) =>
                  onChange({ ...value, accessory: { ...linkButtonAccessory, url } })
                }
                maxLength={EMBED_LIMITS.URL}
                error={
                  linkButtonAccessory.url.length > 0 && !isSafeUrl(linkButtonAccessory.url)
                    ? "Enter a valid http(s) URL"
                    : undefined
                }
              />
            </div>
            <Button
              variant="ghost"
              size="icon"
              title="Remove link button"
              onClick={() => onChange({ ...value, accessory: undefined })}
              className="mt-6 text-red-400 hover:text-red-300"
            >
              <FontAwesomeIcon icon={faTrash} />
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
              onClick={() => onChange({ ...value, accessory: undefined })}
              className="text-red-400 hover:text-red-300"
            >
              <FontAwesomeIcon icon={faTrash} />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SectionEditor;
