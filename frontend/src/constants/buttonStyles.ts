export const BUTTON_STYLE_PRIMARY = "#5865F2";
export const BUTTON_STYLE_SECONDARY = "#4E5058";
export const BUTTON_STYLE_SUCCESS = "#248046";
export const BUTTON_STYLE_DANGER = "#DA373C";

export const BUTTON_STYLE_OPTIONS = [
  { key: "1", label: "Blue", color: BUTTON_STYLE_PRIMARY },
  { key: "2", label: "Grey", color: BUTTON_STYLE_SECONDARY },
  { key: "3", label: "Green", color: BUTTON_STYLE_SUCCESS },
  { key: "4", label: "Red", color: BUTTON_STYLE_DANGER },
] as const;

// Style 5 (Link) is not panel-selectable, but the preview renders imported gallery panels.
export const BUTTON_STYLE_COLOURS: Record<number, string> = {
  ...Object.fromEntries(BUTTON_STYLE_OPTIONS.map((o) => [Number(o.key), o.color] as const)),
  5: BUTTON_STYLE_SECONDARY,
};
