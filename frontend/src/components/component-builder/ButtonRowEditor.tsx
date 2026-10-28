import { useId, type FC } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faPlus, faTrash } from "@fortawesome/free-solid-svg-icons";
import Button from "@/components/Button";
import Select from "@/components/Select";
import TextInput from "@/components/TextInput";
import { useFocusAfterRemove } from "@/hooks/useFocusAfterRemove";
import { useTouchedFields } from "@/hooks/useTouchedFields";
import {
  MAX_ROW_BUTTONS,
  MAX_URL_LENGTH,
  linkLabelError,
  linkUrlError,
  type V2ButtonRow,
  type V2ButtonRowButton,
} from "@/lib/component-tree";
import PanelButtonTag from "./PanelButtonTag";
import { withOwnPanel, type PickerPanel } from "./picker-panels";

interface ButtonRowEditorProps {
  value: V2ButtonRow;
  onChange: (updated: V2ButtonRow) => void;
  unplacedPanels?: PickerPanel[];
  allPanels?: PickerPanel[];
  saveAttempted?: boolean;
}

const ButtonRowEditor: FC<ButtonRowEditorProps> = ({
  value,
  onChange,
  unplacedPanels,
  allPanels = [],
  saveAttempted = false,
}) => {
  const hintId = useId();
  const { shows, touch } = useTouchedFields(saveAttempted);
  const { targetRef: addRef, request: focusAddButton } = useFocusAfterRemove<HTMLButtonElement>();
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
        const panelId = unplacedPanels?.[0]?.panel_id;
        if (panelId === undefined) return b;
        return { id: b.id, kind: "panel", panel_id: panelId };
      }
      if (!currentlyPanel) return b;
      return { id: b.id, kind: "link", label: "", url: "" };
    });
    onChange({ ...value, buttons });
  };

  const removeButton = (index: number) => {
    focusAddButton();
    onChange({ ...value, buttons: value.buttons.filter((_, i) => i !== index) });
  };

  const addButton = () => {
    if (value.buttons.length >= MAX_ROW_BUTTONS) return;
    onChange({
      ...value,
      buttons: [...value.buttons, { id: crypto.randomUUID(), label: "", url: "" }],
    });
  };

  return (
    <div className="flex flex-col gap-3">
      {value.buttons.map((b, i) => {
        const isPanelMode = b.kind === "panel";
        const noneUnplaced = unplacedPanels?.length === 0;
        const panelOptions =
          b.kind === "panel" && unplacedPanels
            ? withOwnPanel(unplacedPanels, allPanels, b.panel_id)
            : (unplacedPanels ?? []);

        return (
          <div key={b.id} className="p-3 rounded bg-gray-600 flex items-start gap-2">
            <div className="flex-1 flex flex-col gap-2">
              {unplacedPanels !== undefined && (
                <div
                  role="group"
                  aria-label={`Button ${i + 1} type`}
                  className="flex items-center gap-2"
                >
                  <Button
                    variant={isPanelMode ? "outline" : "primary"}
                    size="sm"
                    aria-pressed={!isPanelMode}
                    onClick={() => setButtonMode(i, "link")}
                  >
                    {!isPanelMode && <FontAwesomeIcon icon={faCheck} aria-hidden="true" />}
                    Link
                  </Button>
                  <Button
                    variant={isPanelMode ? "primary" : "outline"}
                    size="sm"
                    aria-pressed={isPanelMode}
                    visuallyDisabled={!isPanelMode && noneUnplaced}
                    aria-describedby={
                      !isPanelMode && noneUnplaced ? `${hintId}-${b.id}` : undefined
                    }
                    title={
                      !isPanelMode && noneUnplaced
                        ? "Every panel is already placed as a button"
                        : undefined
                    }
                    onClick={() => setButtonMode(i, "panel")}
                  >
                    {isPanelMode && <FontAwesomeIcon icon={faCheck} aria-hidden="true" />}
                    Ticket panel
                  </Button>
                  {!isPanelMode && noneUnplaced && (
                    <span id={`${hintId}-${b.id}`} hidden>
                      Every panel is already placed as a button
                    </span>
                  )}
                </div>
              )}

              {isPanelMode ? (
                <div className="flex items-center gap-2">
                  <Select
                    className="flex-1"
                    label={`Ticket panel for button ${i + 1}`}
                    hideLabel
                    placeholder="Select a panel..."
                    value={String(b.panel_id)}
                    options={panelOptions.map((p) => ({
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
                    onBlur={() => touch(`${b.id}:label`)}
                    maxLength={80}
                    error={shows(`${b.id}:label`) ? linkLabelError(b.label) : undefined}
                  />
                  <TextInput
                    label="URL"
                    value={b.url}
                    onChange={(url) => updateLinkField(i, { url })}
                    maxLength={MAX_URL_LENGTH}
                    onBlur={() => touch(`${b.id}:url`)}
                    error={shows(`${b.id}:url`) ? linkUrlError(b.url) : undefined}
                  />
                </div>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              title={`Remove button ${i + 1}`}
              aria-label={`Remove button ${i + 1}`}
              onClick={() => removeButton(i)}
              className={`${unplacedPanels === undefined ? "mt-6" : "mt-1"} text-red-300 hover:text-red-200`}
            >
              <FontAwesomeIcon icon={faTrash} aria-hidden="true" />
            </Button>
          </div>
        );
      })}
      <div className="flex items-center gap-3">
        <Button
          ref={addRef}
          variant="dashed"
          onClick={addButton}
          disabled={value.buttons.length >= MAX_ROW_BUTTONS}
          title={
            value.buttons.length >= MAX_ROW_BUTTONS
              ? `Maximum of ${MAX_ROW_BUTTONS} buttons per row`
              : undefined
          }
          className="text-sm font-medium w-fit"
        >
          <FontAwesomeIcon icon={faPlus} /> Add button
        </Button>
        <span className="text-xs">
          {value.buttons.length}/{MAX_ROW_BUTTONS} buttons
        </span>
      </div>
    </div>
  );
};

export default ButtonRowEditor;
