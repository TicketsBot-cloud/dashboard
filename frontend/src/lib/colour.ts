export function intToColour(colour: number): string {
  return `#${colour.toString(16).padStart(6, "0")}`;
}

export function colourToInt(hex: string): number {
  return parseInt(hex.replace("#", ""), 16);
}

// Discord sends 0 for "no colour"; it renders as the default grey, not black.
export function roleColour(colour: number): string {
  return colour === 0 ? "#99AAB5" : intToColour(colour);
}

export function normaliseColour(colour: string): string {
  return colour.startsWith("#") ? colour : `#${colour}`;
}

export const DISCORD_DEFAULT_EMBED_BORDER = "#1e1f22";

export function embedColourHex(colour: number | string | null | undefined): string | null {
  if (colour == null || colour === "") return null;
  const hex =
    typeof colour === "number" ? intToColour(colour) : normaliseColour(colour).toLowerCase();
  return /^#[0-9a-f]{6}$/.test(hex) ? hex : null;
}

export function embedColourInt(colour: number | string | null | undefined): number | null {
  const hex = embedColourHex(colour);
  return hex === null ? null : colourToInt(hex);
}

export function embedBorderColour(colour: number | string | null | undefined): string {
  return embedColourHex(colour) ?? DISCORD_DEFAULT_EMBED_BORDER;
}
