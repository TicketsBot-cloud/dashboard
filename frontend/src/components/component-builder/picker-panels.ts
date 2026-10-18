export type PickerPanel = { panel_id: number; label: string };

/** The unplaced panels plus the one a control already holds, so its current choice stays listed. */
export function withOwnPanel(
  unplaced: PickerPanel[],
  allPanels: PickerPanel[],
  ownPanelId: number,
): PickerPanel[] {
  if (unplaced.some((p) => p.panel_id === ownPanelId)) return unplaced;
  const own = allPanels.find((p) => p.panel_id === ownPanelId);
  return own ? [...unplaced, own] : unplaced;
}
