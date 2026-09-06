import type { FC } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus, faTrash } from "@fortawesome/free-solid-svg-icons";
import Button from "@/components/Button";
import Select from "@/components/Select";
import TextInput from "@/components/TextInput";
import { EMBED_LIMITS } from "@/constants/embedLimits";
import { isSafeUrl } from "@/lib/url";
import type { V2ButtonRow, V2ButtonRowButton } from "@/lib/component-tree";
import PanelButtonTag from "./PanelButtonTag";

const MAX_BUTTONS = 5;

interface ButtonRowEditorProps {
  value: V2ButtonRow;
  onChange: (updated: V2ButtonRow) => void;
  /**
   * Panels not yet placed elsewhere in the tree (plus, for a row already pointing at a panel,
   * that panel's own entry - the caller is responsible for including it). Undefined means this
   * builder is being used somewhere with no "panels" concept at all (single-panel or
   * welcome-message message), in which case none of the panel-placement UI below renders and
   * this behaves exactly as a link-only button row.
   */
  availablePanels?: { panel_id: number; label: string; emoji?: string }[];
}

const ButtonRowEditor: FC<ButtonRowEditorProps> = ({ value, onChange, availablePanels }) => {
  const updateLinkField = (index: number, update: Partial<{ label: string; url: string }>) => {
    const buttons = value.buttons.map((b, i) => {
      if (i !== index || b.kind === "panel") return b;
      return { ...b, ...update };
    });
    onChange({ ...value, buttons });
  };

  const setPanelId = (index: number, panelId: number) => {
    const buttons = value.buttons.map((b, i) =>
      i === index && b.kind === "panel" ? { ...b, panel_id: panelId } : b,
    );
    onChange({ ...value, buttons });
  };

  const setButtonMode = (index: number, kind: "link" | "panel") => {
    const buttons = value.buttons.map((b, i): V2ButtonRowButton => {
      if (i !== index) return b;
      const currentlyPanel = b.kind === "panel";
      if (kind === "panel") {
        if (currentlyPanel) return b;
        const panelId = availablePanels?.[0]?.panel_id;
        // The "Ticket panel" toggle is disabled whenever availablePanels is empty, so this
        // should never be reached with nothing to default to - guard anyway rather than
        // inventing a hidden panel_id such as 0.
        if (panelId === undefined) return b;
        return { id: b.id, kind: "panel", panel_id: panelId };
      }
      if (!currentlyPanel) return b;
      return { id: b.id, kind: "link", label: "", url: "" };
    });
    onChange({ ...value, buttons });
  };

  const removeButton = (index: number) => {
    onChange({ ...value, buttons: value.buttons.filter((_, i) => i !== index) });
  };

  const addButton = () => {
    if (value.buttons.length >= MAX_BUTTONS) return;
    onChange({
      ...value,
      buttons: [...value.buttons, { id: crypto.randomUUID(), label: "", url: "" }],
    });
  };

  return (
    <div className="flex flex-col gap-3">
      {value.buttons.map((b, i) => {
        const isPanelMode = b.kind === "panel";

        return (
          <div key={b.id} className="p-3 rounded bg-gray-600 flex items-start gap-2">
            <div className="flex-1 flex flex-col gap-2">
              {availablePanels !== undefined && (
                <div className="flex items-center gap-2">
                  <Button
                    variant={isPanelMode ? "outline" : "secondary"}
                    size="sm"
                    onClick={() => setButtonMode(i, "link")}
                  >
                    Link
                  </Button>
                  <Button
                    variant={isPanelMode ? "secondary" : "outline"}
                    size="sm"
                    visuallyDisabled={availablePanels.length === 0}
                    title={
                      availablePanels.length === 0
                        ? "All panels are already placed elsewhere"
                        : undefined
                    }
                    onClick={() => setButtonMode(i, "panel")}
                  >
                    Ticket panel
                  </Button>
                </div>
              )}

              {isPanelMode ? (
                <div className="flex items-center gap-2">
                  <Select
                    className="flex-1"
                    label="Ticket panel"
                    hideLabel
                    placeholder="Select a panel..."
                    value={String(b.panel_id)}
                    options={(availablePanels ?? []).map((p) => ({
                      key: String(p.panel_id),
                      label: p.label,
                    }))}
                    onChange={(key) => {
                      if (key !== null) setPanelId(i, Number(key));
                    }}
                  />
                  <PanelButtonTag />
                </div>
              ) : (
                <div className="grid gap-2 grid-cols-1 md:grid-cols-2">
                  <TextInput
                    label="Button label"
                    value={b.label}
                    onChange={(label) => updateLinkField(i, { label })}
                    maxLength={80}
                  />
                  <TextInput
                    label="URL"
                    value={b.url}
                    onChange={(url) => updateLinkField(i, { url })}
                    maxLength={EMBED_LIMITS.URL}
                    error={
                      b.url.length > 0 && !isSafeUrl(b.url)
                        ? "Enter a valid http(s) URL"
                        : undefined
                    }
                  />
                </div>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              title="Remove button"
              onClick={() => removeButton(i)}
              className={`${availablePanels === undefined ? "mt-6" : "mt-1"} text-red-400 hover:text-red-300`}
            >
              <FontAwesomeIcon icon={faTrash} />
            </Button>
          </div>
        );
      })}
      <div className="flex items-center gap-3">
        <Button
          variant="dashed"
          onClick={addButton}
          disabled={value.buttons.length >= MAX_BUTTONS}
          title={
            value.buttons.length >= MAX_BUTTONS
              ? `Maximum of ${MAX_BUTTONS} buttons per row`
              : undefined
          }
          className="text-sm font-medium w-fit"
        >
          <FontAwesomeIcon icon={faPlus} /> Add button
        </Button>
        <span className="text-xs">
          {value.buttons.length}/{MAX_BUTTONS} buttons
        </span>
      </div>
    </div>
  );
};

export default ButtonRowEditor;
