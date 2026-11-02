import { THIS_PANEL_ID } from "@/lib/component-tree";

export type PickerPanel = { panel_id: number; label: string };

export const THIS_PANEL_PICKER: PickerPanel = {
  panel_id: THIS_PANEL_ID,
  label: "This panel's button",
};

export function withOwnPanel(
  unplaced: PickerPanel[],
  allPanels: PickerPanel[],
  ownPanelId: number,
): PickerPanel[] {
  if (unplaced.some((p) => p.panel_id === ownPanelId)) return unplaced;
  const own = allPanels.find((p) => p.panel_id === ownPanelId);
  return own ? [...unplaced, own] : unplaced;
}
