const CDN = "https://cdn.discordapp.com";

export function defaultAvatarUrl(index = 0): string {
  return `${CDN}/embed/avatars/${index}.png`;
}

// Picked once per page load so re-renders don't swap the image.
export const RANDOM_DEFAULT_AVATAR_URL = defaultAvatarUrl(Math.floor(Math.random() * 6));

export function userAvatarUrl(userId: string, avatar?: string | null, size = 256): string {
  if (avatar?.startsWith("http")) return avatar;
  if (avatar) {
    const ext = avatar.startsWith("a_") ? "gif" : "webp";
    return `${CDN}/avatars/${userId}/${avatar}.${ext}?size=${size}`;
  }
  if (/^[1-9]\d*$/.test(userId)) return defaultAvatarUrl(Number((BigInt(userId) >> 22n) % 6n));
  return RANDOM_DEFAULT_AVATAR_URL;
}

export function guildIconUrl(guildId: string, icon: string, size = 256): string {
  const ext = icon.startsWith("a_") ? "gif" : "webp";
  return `${CDN}/icons/${guildId}/${icon}.${ext}?size=${size}`;
}

export function emojiUrl(emojiId: string, animated: boolean): string {
  return `${CDN}/emojis/${emojiId}.${animated ? "gif" : "png"}`;
}
