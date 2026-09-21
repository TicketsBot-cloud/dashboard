import { AVATAR_PLACEHOLDER } from "@/lib/embed-avatar";

export interface EmbedUrlFields {
  url?: string | null;
  image_url?: string | null;
  thumbnail_url?: string | null;
  author?: { icon_url?: string | null; url?: string | null } | null;
  footer?: { icon_url?: string | null } | null;
}

function urlAuthority(rawUrl: string): string {
  const separator = rawUrl.indexOf("://");
  if (separator === -1) return rawUrl;

  const after = rawUrl.slice(separator + 3);
  const end = after.search(/[/?#]/);
  return end === -1 ? after : after.slice(0, end);
}

// Mirrors utils.ValidateHttpUrl. Not `new URL()`: it normalises "https:/example.com", which
// the backend rejects, so the two sides would disagree about what is saveable.
export function embedUrlError(value: string | null | undefined): string | undefined {
  if (!value || value === AVATAR_PLACEHOLDER) return undefined;

  const lower = value.toLowerCase();
  if (!lower.startsWith("http://") && !lower.startsWith("https://")) {
    return "URL must start with http:// or https://";
  }

  if (urlAuthority(value).trim() === "") return "URL must include a host";

  return undefined;
}

export function collectEmbedUrlErrors(embed: EmbedUrlFields | null | undefined): string[] {
  if (!embed) return [];

  const fields: Array<[string, string | null | undefined]> = [
    ["Title URL", embed.url],
    ["Author Icon URL", embed.author?.icon_url],
    ["Author URL", embed.author?.url],
    ["Thumbnail URL", embed.thumbnail_url],
    ["Image URL", embed.image_url],
    ["Footer Icon URL", embed.footer?.icon_url],
  ];

  return fields.filter(([, value]) => embedUrlError(value) !== undefined).map(([label]) => label);
}
