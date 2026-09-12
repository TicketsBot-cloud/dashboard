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
