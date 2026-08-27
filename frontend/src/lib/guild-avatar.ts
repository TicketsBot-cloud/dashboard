const AVATAR_COLOURS = [
  "#5865F2",
  "#57F287",
  "#FEE75C",
  "#EB459E",
  "#ED4245",
  "#3BA55C",
  "#FAA61A",
  "#E67E22",
  "#9B59B6",
  "#1ABC9C",
];

export function getGuildInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 3)
    .join("")
    .toUpperCase();
}

export function getGuildAvatarColor(guildId: string): string {
  return AVATAR_COLOURS[Number(BigInt(guildId) % BigInt(AVATAR_COLOURS.length))];
}
