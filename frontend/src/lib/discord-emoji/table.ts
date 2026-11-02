import type { DiscordItem } from "@emoji-platform-data/discord";

export interface DiscordEmojiTable {
  names: Map<string, string>;
  glyphs: Map<string, string>;
}

const ZWJ = String.fromCodePoint(0x200d);
const VS16 = String.fromCodePoint(0xfe0f);

export function buildEmojiTable(byEmoji: Record<string, DiscordItem>): DiscordEmojiTable {
  const names = new Map<string, string>();
  const glyphs = new Map<string, string>();
  for (const [glyph, item] of Object.entries(byEmoji)) {
    // Discord leaves over-qualified and unqualified-ZWJ spellings as text.
    if (glyph === item.emoji || (!glyph.includes(ZWJ) && !glyph.endsWith(VS16))) {
      glyphs.set(glyph, item.name);
    }
    // The bundled Twemoji font stops at Emoji 15.0.
    if (item.unicodeVersion > 15) continue;
    for (const name of [item.name, ...item.aliases]) names.set(name, item.emoji);
  }
  return { names, glyphs };
}

export type EmojiSplitPart =
  | { emoji: false; text: string }
  | { emoji: true; surrogate: string; name: string };

const CANDIDATE =
  // eslint-disable-next-line no-misleading-character-class
  /[\u200d\ud800-\udfff\u0300-\u036f\ufe20-\ufe2f\u20d0-\u20ff\ufe0e\ufe0f\u270b\u2b50\u2728\u26a1\u26c5\u26c4\u2614\u2615\u26bd\u26be\u26f3\u26f5\u2693\u26fd\u26f2\u26fa\u26ea\u231a\u23f0\u231b\u23f3\u26ce\u2648-\u2653\u270a\u274c\u2b55\u26d4\u2757\u2755\u2753\u2754\u2705\u274e\u267f\u23e9-\u23ec\u2795-\u2797\u27b0\u27bf\u26aa\u26ab\u25fe\u25fd\u2b1b\u2b1c\u26a7]/;

const TOKEN =
  /\ud83c[\udffb-\udfff](?=\ud83c[\udffb-\udfff])|(?:[^\ud800-\udfff][\u0300-\u036f\ufe20-\ufe2f\u20d0-\u20ff]?|[\u0300-\u036f\ufe20-\ufe2f\u20d0-\u20ff]|(?:\ud83c[\udde6-\uddff]){2}|[\ud800-\udbff][\udc00-\udfff]|[\ud800-\udfff])[\ufe0e\ufe0f]?(?:[\u0300-\u036f\ufe20-\ufe2f\u20d0-\u20ff]|\ud83c[\udffb-\udfff])?(?:\u200d(?:[^\ud800-\udfff]|(?:\ud83c[\udde6-\uddff]){2}|[\ud800-\udbff][\udc00-\udfff])[\ufe0e\ufe0f]?(?:[\u0300-\u036f\ufe20-\ufe2f\u20d0-\u20ff]|\ud83c[\udffb-\udfff])?)*/g;

const BLACK_FLAG = String.fromCodePoint(0x1f3f4);
const CANCEL_TAG = String.fromCodePoint(0xe007f);
const TAG_LETTER = /^[\u{e0061}-\u{e007a}]$/u;

export function splitUnicodeEmoji(value: string, table: DiscordEmojiTable): EmojiSplitPart[] {
  if (!CANDIDATE.test(value)) return [{ emoji: false, text: value }];

  const toPart = (token: string): EmojiSplitPart => {
    const name = table.glyphs.get(token);
    return name === undefined
      ? { emoji: false, text: token }
      : { emoji: true, surrogate: token, name };
  };

  const out: EmojiSplitPart[] = [];
  const push = (part: EmojiSplitPart) => {
    const last = out[out.length - 1];
    if (!part.emoji && last && !last.emoji) last.text += part.text;
    else out.push(part);
  };

  let flag = "";
  for (let token of value.match(TOKEN) ?? []) {
    if (flag) {
      if (token === CANCEL_TAG) {
        token = flag + token;
        flag = "";
      } else if (TAG_LETTER.test(token)) {
        flag += token;
        continue;
      } else {
        out.push(toPart(flag));
        flag = "";
      }
    } else if (token === BLACK_FLAG) {
      flag = token;
      continue;
    }
    push(toPart(token));
  }
  if (flag) out.push(toPart(flag));
  return out;
}
