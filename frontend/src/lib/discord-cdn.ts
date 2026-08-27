const CDN = "https://cdn.discordapp.com";

export function defaultAvatarUrl(index = 0): string {
  return `${CDN}/embed/avatars/${index}.png`;
}

export function userAvatarUrl(userId: string, avatar?: string | null, size = 256): string {
  if (avatar?.startsWith("http")) return avatar;
  if (avatar) {
    const ext = avatar.startsWith("a_") ? "gif" : "webp";
    return `${CDN}/avatars/${userId}/${avatar}.${ext}?size=${size}`;
  }
  try {
    return defaultAvatarUrl(Number((BigInt(userId) >> 22n) % 6n));
  } catch {
    return defaultAvatarUrl();
  }
}

export function guildIconUrl(guildId: string, icon: string, size = 256): string {
  const ext = icon.startsWith("a_") ? "gif" : "webp";
  return `${CDN}/icons/${guildId}/${icon}.${ext}?size=${size}`;
}

export function emojiUrl(emojiId: string, animated: boolean): string {
  return `${CDN}/emojis/${emojiId}.${animated ? "gif" : "png"}`;
}
