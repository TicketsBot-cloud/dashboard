import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FC } from "react";
import type { V2Component } from "@/lib/component-tree";
import { pendingBlockFocus } from "@/lib/block-focus";
import ComponentBudgetMeter from "./ComponentBudgetMeter";
import BlockList from "./BlockList";
import type { PickerPanel } from "./picker-panels";

interface ComponentTreeBuilderProps {
  components: V2Component[];
  onChange: (components: V2Component[]) => void;
  allowAvatarPlaceholder?: boolean;
  budgetUsed: number;
  budgetMax: number;
  budgetReservedNote?: string;
  textUsed: number;
  disabled?: boolean;
  availablePanels?: PickerPanel[];
  allPanels?: PickerPanel[];
  selectMenuModeOn?: boolean;
  saveAttempted?: boolean;
  blockErrors?: Map<string, string[]>;
}

const ComponentTreeBuilder: FC<ComponentTreeBuilderProps> = ({
  components,
  onChange,
  allowAvatarPlaceholder,
  budgetUsed,
  budgetMax,
  budgetReservedNote,
  textUsed,
  disabled,
  availablePanels,
  allPanels,
  selectMenuModeOn,
  saveAttempted,
  blockErrors,
}) => {
  const [announcement, setAnnouncement] = useState("");
  const announceFrame = useRef(0);

  // Live regions only speak on a change, so a repeat is cleared and set again a frame later.
  const announce = useCallback((message: string) => {
    cancelAnimationFrame(announceFrame.current);
    setAnnouncement("");
    announceFrame.current = requestAnimationFrame(() => setAnnouncement(message));
  }, []);
  useEffect(() => () => cancelAnimationFrame(announceFrame.current), []);

  useLayoutEffect(() => {
    const id = pendingBlockFocus.id;
    if (!id) return;
    pendingBlockFocus.id = null;
    document.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(id)}"]`)?.focus();
  });

  return (
    <div>
      <ComponentBudgetMeter
        used={budgetUsed}
        max={budgetMax}
        reservedNote={budgetReservedNote}
        textUsed={textUsed}
      />
      <div className="mt-3">
        <BlockList
          blocks={components}
          tree={components}
          onTreeChange={onChange}
          allowAvatarPlaceholder={allowAvatarPlaceholder}
          nested={false}
          onAnnounce={announce}
          disabled={disabled}
          budgetMax={budgetMax}
          availablePanels={availablePanels}
          allPanels={allPanels}
          selectMenuModeOn={selectMenuModeOn}
          saveAttempted={saveAttempted}
          blockErrors={blockErrors}
        />
      </div>
      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>
    </div>
  );
};

export default ComponentTreeBuilder;
