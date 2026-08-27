import { defaultAvatarUrl } from "@/lib/discord-cdn";

const AVATAR_PLACEHOLDER = "%avatar_url%";

export function previewAvatarUrl(url: string | null | undefined): string | null | undefined {
  return url === AVATAR_PLACEHOLDER ? defaultAvatarUrl() : url;
}
