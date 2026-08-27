export const PANEL_SWITCH_OPTIONS = [
  {
    key: "0",
    label: "Auto Unclaim",
    description: "Automatically unclaim if claimer has no access to new panel",
  },
  {
    key: "1",
    label: "Block Switch",
    description: "Prevent switching if claimer has no access to new panel",
  },
  {
    key: "2",
    label: "Remove On Unclaim",
    description: "Allow switch, remove claimer's access when they unclaim",
  },
  {
    key: "3",
    label: "Keep Access",
    description: "Allow switch and keep claimer's access even after unclaiming",
  },
] as const;
