import { legacyParse } from "./legacy-url";

const LINK_PROTOCOLS = ["http:", "https:", "discord:", "tel:", "sms:", "mailto:"];

const FILLER_CHARS = ["\u034f", "\u17b4", "\u17b5", "\u1160", "\u3164", "\uffa0"];
const INVISIBLE = new RegExp(
  `${/\p{Cf}|\p{Zl}|\p{Zp}|[^\P{Cc}\n]|[^\P{Zs} ]/u.source}|${FILLER_CHARS.join("|")}`,
  "gu",
);

export function sanitizeWhitespace(value: string): string {
  return value.replace(INVISIBLE, "");
}

const HOMOGLYPHS: [string, string[]][] = [
  [
    "h",
    [
      "H",
      "\u04bb",
      "\u0570",
      "\u13c2",
      "\u210e",
      "\u{1D421}",
      "\u{1D489}",
      "\u{1D4BD}",
      "\u{1D4F1}",
      "\u{1D525}",
      "\u{1D559}",
      "\u{1D58D}",
      "\u{1D5C1}",
      "\u{1D5F5}",
      "\u{1D629}",
      "\u{1D65D}",
      "\u{1D691}",
      "\uff48",
    ],
  ],
  [
    "t",
    [
      "T",
      "\u{1D42D}",
      "\u{1D461}",
      "\u{1D495}",
      "\u{1D4C9}",
      "\u{1D4FD}",
      "\u{1D531}",
      "\u{1D565}",
      "\u{1D599}",
      "\u{1D5CD}",
      "\u{1D601}",
      "\u{1D635}",
      "\u{1D669}",
      "\u{1D69D}",
    ],
  ],
  [
    "p",
    [
      "P",
      "\u03c1",
      "\u03f1",
      "\u0440",
      "\u2374",
      "\u2ca3",
      "\u{1D429}",
      "\u{1D45D}",
      "\u{1D491}",
      "\u{1D4C5}",
      "\u{1D4F9}",
      "\u{1D52D}",
      "\u{1D561}",
      "\u{1D595}",
      "\u{1D5C9}",
      "\u{1D5FD}",
      "\u{1D631}",
      "\u{1D665}",
      "\u{1D699}",
      "\u{1D6D2}",
      "\u{1D6E0}",
      "\u{1D70C}",
      "\u{1D71A}",
      "\u{1D746}",
      "\u{1D754}",
      "\u{1D780}",
      "\u{1D78E}",
      "\u{1D7BA}",
      "\u{1D7C8}",
      "\uff50",
      "\u048f",
    ],
  ],
  [
    "s",
    [
      "S",
      "\u01bd",
      "\u0455",
      "\ua731",
      "\uabaa",
      "\u{10448}",
      "\u{118C1}",
      "\u{1D42C}",
      "\u{1D460}",
      "\u{1D494}",
      "\u{1D4C8}",
      "\u{1D4FC}",
      "\u{1D530}",
      "\u{1D564}",
      "\u{1D598}",
      "\u{1D5CC}",
      "\u{1D600}",
      "\u{1D634}",
      "\u{1D668}",
      "\u{1D69C}",
      "\uff53",
    ],
  ],
  [
    ":",
    [
      "\u02d0",
      "\u02f8",
      "\u0589",
      "\u05c3",
      "\u0703",
      "\u0704",
      "\u0903",
      "\u0a83",
      "\u16ec",
      "\u1803",
      "\u1809",
      "\u205a",
      "\u2236",
      "\ua4fd",
      "\ua789",
      "\ufe30",
      "\uff1a",
      ";",
      "\u037e",
    ],
  ],
  [
    "/",
    [
      "\u1735",
      "\u2041",
      "\u2044",
      "\u2215",
      "\u2571",
      "\u27cb",
      "\u29f8",
      "\u2cc6",
      "\u2f03",
      "\u3033",
      "\u30ce",
      "\u31d3",
      "\u4e3f",
      "\u{1D23A}",
    ],
  ],
];
const HOMOGLYPH_MATCHERS = HOMOGLYPHS.map(
  ([ascii, lookalikes]) => [ascii, new RegExp(lookalikes.join("|"), "gu")] as const,
);

export function foldHomoglyphs(value: string): string {
  let out = value;
  for (const [ascii, matcher] of HOMOGLYPH_MATCHERS) out = out.replace(matcher, ascii);
  return out;
}

export function sanitizeFully(value: string): string {
  return foldHomoglyphs(sanitizeWhitespace(value));
}

export function unescapeUrl(value: string): string {
  return value.replace(/\\([^0-9A-Za-z\s])/g, "$1");
}

function tryUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function safeDecode(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

export function isSuspiciousUrl(value: string): boolean {
  if (hasEscapedInvite(value) || sanitizeWhitespace(value) !== value) return true;
  const url = tryUrl(value);
  if (!url) return true;
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  const parts = value.split("/");
  return parts.length < 3 || parts[1] !== "" || safeDecode(parts[2]) !== parts[2];
}

const DISPLAY_SAFE_ASCII = new Set(
  '"-0123456789<>ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz~',
);
const KEEP_ENCODED = new Set([
  0x200e, 0x200f, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x061c, 0x2066, 0x2067, 0x2068, 0x2069,
  0x1f50f, 0x1f510, 0x1f512, 0x1f513, 0x85, 0xa0, 0x1680, 0x2000, 0x2001, 0x2002, 0x2003, 0x2004,
  0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200a, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000, 0x2800,
  0xad, 0x34f, 0x6dd, 0x70f, 0x8e2, 0x115f, 0x1160, 0x17b4, 0x17b5, 0x180b, 0x180c, 0x180d, 0x180e,
  0x200b, 0x200c, 0x200d, 0x2060, 0x2061, 0x2062, 0x2063, 0x2064, 0x2065, 0x3164, 0xfeff, 0xffa0,
  0xfff9, 0xfffa, 0xfffb, 0x110bd, 0x110cd,
]);

function keepsEncoding(code: number): boolean {
  if (code < 128) return !DISPLAY_SAFE_ASCII.has(String.fromCharCode(code));
  return (
    KEEP_ENCODED.has(code) ||
    (code >= 0x600 && code <= 0x605) ||
    (code >= 0x206a && code <= 0x206f) ||
    (code >= 0xfff0 && code <= 0xfff8) ||
    (code >= 0xfe00 && code <= 0xfe0f) ||
    (code >= 0x13430 && code <= 0x13438) ||
    (code >= 0x1bca0 && code <= 0x1bca3) ||
    (code >= 0x1d173 && code <= 0x1d17a) ||
    (code >= 0xe0000 && code <= 0xe0fff)
  );
}

function decodeForDisplay(value: string): string {
  const decoded = safeDecode(value);
  if (decoded === null) return value;

  let out = "";
  let raw = value;
  let plain = decoded;
  while (raw.length > 0) {
    const rawCode = raw.codePointAt(0)!;
    const plainCode = plain.codePointAt(0)!;
    if (rawCode === plainCode) {
      const char = String.fromCodePoint(rawCode);
      out += char;
      raw = raw.substring(char.length);
      plain = plain.substring(char.length);
      continue;
    }
    const char = String.fromCodePoint(plainCode);
    const encoded = encodeURIComponent(char);
    const rawLength = encoded === char ? 3 : encoded.length;
    out += keepsEncoding(plainCode) ? encoded : char;
    raw = raw.substring(rawLength);
    plain = plain.substring(char.length);
  }
  return out;
}

function formatUrl(url: URL): string {
  let origin: string;
  if (url.origin === "null" && url.pathname.startsWith("//")) {
    origin = url.protocol;
  } else {
    let auth = url.username;
    if (url.password) auth += `:${url.password}`;
    if (auth) auth += "@";
    const slashes = url.href.substring(url.protocol.length, url.protocol.length + 2) === "//";
    origin = `${url.protocol}${slashes ? "//" : ""}${auth}${url.host}`;
  }
  return (
    origin +
    decodeForDisplay(url.pathname) +
    decodeForDisplay(url.search) +
    decodeForDisplay(url.hash)
  );
}

export interface NormalizedLink {
  target: string;
  display: string;
}

export function normalizeLink(value: string): NormalizedLink | null {
  if (isSuspiciousUrl(value)) return null;
  const url = tryUrl(value);
  if (!url) return null;
  const protocol = url.protocol.toLowerCase();
  if (!LINK_PROTOCOLS.includes(protocol)) return null;
  if ((protocol === "http:" || protocol === "https:") && !url.hostname) return null;
  // decodeForDisplay throws on some escapes (a trailing %25); the client also shows those as text.
  try {
    const target = formatUrl(url);
    url.username = "";
    url.password = "";
    return { target, display: formatUrl(url) };
  } catch {
    return null;
  }
}

const INVITE_HOST = "discord.gg";
const TEMPLATE_HOST = "discord.new";
const PRIMARY_HOSTS = ["discord.com", "canary.discord.com", "ptb.discord.com", "discordapp.com"];

const BARE_DISCORD_HOST =
  /((https?:\/\/[^ ]*)|^|\s)(discord\.gg|discord\.new|discord\.com|discordapp\.com)/g;
const CODE_SPANS = /`{3,}[\s\S]*?(?:`{3,}|$)|(`{1,2})[^`]+\1(?!`)/g;
const IPV4 =
  "(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]\\d|\\d)(?:\\.(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]\\d|\\d)){3}";
const URL_LIKE = new RegExp(
  `(?:(?:(?:https?:)?//)|www\\.)(?:[^\\s:@]+(?::[^\\s@]*)?@)?(?:localhost|${IPV4}|(?:[a-z\\u00a1-\\uffff0-9-_]+\\.)+(?:(?:[a-z\\u00a1-\\uffff]{2,})))(?::\\d{2,5})?(?:[/?#][^\\s"()\\[\\]<>]*)?`,
  "ig",
);
const TRAILING_PUNCTUATION = /[.,;:?'*_~|]+$/;
const DEV_LINK = /dev:\/\/[\w.~:/?#[\]@!$&'()*+,;=%-]+/i;

const SINGLE_SEGMENT = /^\/([a-zA-Z0-9-]+)$/;
const INVITE_OR_TEMPLATE = /^\/(invite|template)\/([a-zA-Z0-9-]+)\/?\.?$/;
const EVENT = /^\/events\/(\d+)\/(\d+)?(\/(\d+))?/;
const GAME_SHOP =
  /^(?:\/game-shop\/([0-9]+)|\/channels\/([0-9]+)\/game-shop\/(?:[0-9]+))(?:\/([0-9]+)(?:\/([^/]+))?)?\/?$/;
const PRIMARY_PATHS = [
  /^\/channels\/([0-9]+|@me)\/([0-9]+)$/,
  /^\/(application-directory|discovery\/applications)\/([0-9-]+)\/?((about|images|privacy)\/?)?$/,
  /^\/(application-directory|discovery\/applications)\/([0-9-]+)\/store\/?([0-9-]+)?\/?$/,
  /^\/activities\/([0-9-]+)\/?$/,
  /^\/channels\/([0-9]+)\/shop\/([0-9]+)$/,
  /^\/channels\/([0-9]+)\/shop$/,
  /^\/quests\/([0-9-]+)\/?$/,
  /^\/games\/([0-9]+)(?:\/[A-Za-z0-9-]*)?\/?$/,
  /^\/game-servers\/share\/([A-Za-z0-9_-]+)$/,
  /^\/game-organizations\/invite\/([A-Za-z0-9_-]+)\/?$/,
  /^\/users\/([0-9]+)\/?$/,
  /^\/shop$/,
];
const SKU_ID = /^[0-9]+$/;

function stripWww(host: string): string {
  return host.replace(/^www[.]/i, "");
}

function bracketParam(params: URLSearchParams, name: string): string | string[] | undefined {
  let value: string | string[] | undefined;
  for (const [key, item] of params) {
    if (key === name) value = item;
    else if (key === `${name}[]`) value = value === undefined ? [item] : [value, item].flat();
  }
  return value;
}

function authorizesCommandsOnly(query: string): boolean {
  const params = new URLSearchParams(query);
  const scope = bracketParam(params, "scope");
  const scopes = ((Array.isArray(scope) ? scope[0] : scope) ?? "").replace(/\+/g, " ").split(" ");
  return (
    Boolean(bracketParam(params, "client_id")) &&
    scopes.every((s) => s === "" || s === "applications.commands")
  );
}

function hasSkuId(query: string): boolean {
  return new URLSearchParams(query)
    .getAll("skuIds")
    .some((ids) => ids.split(",").some((id) => SKU_ID.test(id)));
}

function isCodedLink(candidate: string): boolean {
  const url = legacyParse(candidate);
  const path = url?.pathname;
  if (url == null || path == null) return false;
  // Unlike every other kind, event links count on any host.
  if (EVENT.exec(path)?.[2] != null) return true;
  const host = stripWww(url.host ?? "");
  if (host === INVITE_HOST) {
    const web = url.protocol === "http:" || url.protocol === "https:";
    return web && SINGLE_SEGMENT.test(path) && !candidate.includes("\\");
  }
  if (host === TEMPLATE_HOST) return SINGLE_SEGMENT.test(path);
  if (!PRIMARY_HOSTS.includes(host)) return false;
  const query = url.query != null && url.query.length <= 1000 ? url.query : null;
  const inviteOrTemplate = INVITE_OR_TEMPLATE.exec(path);
  if (inviteOrTemplate) return inviteOrTemplate[1] === "template" || !candidate.includes("\\");
  if (path.startsWith("/oauth2/authorize") && query != null && authorizesCommandsOnly(query)) {
    return true;
  }
  const gameShop = GAME_SHOP.exec(path);
  if (gameShop && (gameShop[3] != null || (query != null && hasSkuId(query)))) return true;
  return PRIMARY_PATHS.some((re) => re.test(path));
}

export function containsDiscordLink(value: string): boolean {
  const prefixed = value.replace(
    BARE_DISCORD_HOST,
    (match, lead: string, url: string | undefined, host: string) =>
      url == null ? `${lead}http://${host}` : match,
  );
  const candidates = (prefixed.replaceAll(CODE_SPANS, " ").match(URL_LIKE) ?? []).map((candidate) =>
    candidate.replace(TRAILING_PUNCTUATION, ""),
  );
  // Only the first dev:// link counts, and code spans don't hide it.
  const devLink = DEV_LINK.exec(prefixed);
  if (devLink) candidates.push(devLink[0]);
  return candidates.some(isCodedLink);
}

function hasEscapedInvite(value: string): boolean {
  if (!value.includes("\\")) return false;
  const url = legacyParse(value);
  const host = stripWww(url?.host ?? "");
  if (host === INVITE_HOST) return true;
  return PRIMARY_HOSTS.includes(host) && (url?.pathname?.toUpperCase().includes("INVITE") ?? false);
}
