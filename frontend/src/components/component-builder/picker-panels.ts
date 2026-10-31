export type PickerPanel = { panel_id: number; label: string };

export function withOwnPanel(
  unplaced: PickerPanel[],
  allPanels: PickerPanel[],
  ownPanelId: number,
): PickerPanel[] {
  if (unplaced.some((p) => p.panel_id === ownPanelId)) return unplaced;
  const own = allPanels.find((p) => p.panel_id === ownPanelId);
  return own ? [...unplaced, own] : unplaced;
}
