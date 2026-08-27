/**
 * Checks whether a URL is safe to use in an href attribute.
 * Only allows http: and https: protocols to prevent javascript: injection.
 */
export function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}
