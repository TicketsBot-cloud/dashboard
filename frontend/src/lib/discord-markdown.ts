/**
 * Discord markdown tokenizer for DiscordContent.
 *
 * Blocks are parsed before inline markup so fenced code keeps its contents
 * literal. Two things worth knowing before editing:
 *
 * - The inline scanner uses sticky regexes against the full string instead of
 *   slicing, because the `_italic_` rule needs `\b` to see the character before
 *   the cursor. On a slice it always matches and `my_file_name.txt` italicises.
 * - No lookbehind anywhere. It's a parse-time SyntaxError on Safari < 16.4,
 *   which would break the whole bundle rather than just markdown.
 */

import { isSafeUrl } from "./url";

export type MdMark = "bold" | "italic" | "underline" | "strike" | "spoiler";
export type MdTimestampStyle = "t" | "T" | "d" | "D" | "f" | "F" | "R";

export type MdNode =
  // Leaves
  | { type: "text"; value: string }
  | { type: "code"; code: string }
  | { type: "codeBlock"; lang: string | null; code: string }
  | { type: "userMention"; id: string }
  | { type: "roleMention"; id: string }
  | { type: "channelMention"; id: string }
  | { type: "globalMention"; name: "everyone" | "here" }
  | { type: "emoji"; name: string; id: string; animated: boolean }
  | { type: "timestamp"; unix: number; style: MdTimestampStyle }
  // Containers
  | { type: "mark"; mark: MdMark; children: MdNode[] }
  | { type: "link"; url: string; children: MdNode[] }
  | { type: "heading"; level: 1 | 2 | 3; children: MdNode[] }
  | { type: "subtext"; children: MdNode[] }
  | { type: "quote"; children: MdNode[] };

const text = (value: string): MdNode => ({ type: "text", value });

const mark = (m: MdMark, body: string): MdNode => ({
  type: "mark",
  mark: m,
  children: parseInline(body),
});

/** Largest value a Date can hold, in ms. */
const MAX_DATE_MS = 8.64e15;

function buildTimestamp(match: RegExpExecArray): MdNode {
  const unix = Number(match[1]);
  const ms = unix * 1000;
  // Out-of-range values would render as "Invalid Date".
  if (!Number.isFinite(ms) || Math.abs(ms) > MAX_DATE_MS) return text(match[0]);
  return { type: "timestamp", unix, style: (match[2] as MdTimestampStyle) || "f" };
}

/** Unsafe URLs fall back to the raw source, so the text stays visible. */
function buildLink(url: string, raw: string, label?: string): MdNode {
  if (!isSafeUrl(url)) return text(raw);
  return { type: "link", url, children: label === undefined ? [text(url)] : parseInline(label) };
}

interface InlineRule {
  re: RegExp;
  /** Left-context check, since we can't use lookbehind. */
  leftGuard?: (src: string, at: number) => boolean;
  build: (match: RegExpExecArray) => MdNode;
}

const RE_ESCAPE = /\\([^0-9A-Za-z\s])/y;

/**
 * Keyed by the character that triggers the rule. Rules under different keys
 * can't collide, so only the order *within* a key matters. Don't merge keys
 * either — folding role and user mentions together loses role colouring.
 */
const INLINE_RULES: Record<string, InlineRule[]> = {
  // Terminal, contents are never re-parsed. The `[^`]` tail and `(?!`)` are
  // what stop an unclosed ``` fence being eaten as a one-backtick code span.
  "`": [{ re: /(`{1,2})([\s\S]*?[^`])\1(?!`)/y, build: (m) => ({ type: "code", code: m[2] }) }],

  "|": [{ re: /\|\|([\s\S]+?)\|\|/y, build: (m) => mark("spoiler", m[1]) }],

  // `**` has to come first. Its `(?!\*)` also covers `***bold italic***` — the
  // body backtracks to `*a*` and recursion picks up the italic. The italic body
  // is `(?:\*\*|[^*])+?` so `*a **b** c*` doesn't stop at the inner `**`, and
  // the `(?=[^\s*])` keeps `5 * 3 = 15` from italicising.
  "*": [
    { re: /\*\*([\s\S]+?)\*\*(?!\*)/y, build: (m) => mark("bold", m[1]) },
    { re: /\*(?=[^\s*])((?:\*\*|[^*])+?)\*(?!\*)/y, build: (m) => mark("italic", m[1]) },
  ],

  // `__` first, same as above. The `\b…\b` is what keeps snake_case_words plain.
  _: [
    { re: /__([\s\S]+?)__(?!_)/y, build: (m) => mark("underline", m[1]) },
    { re: /\b_((?:__|[^_])+?)_\b/y, build: (m) => mark("italic", m[1]) },
  ],

  // No closing guard here, unlike ** and __ above. Discord allows a stray `~`
  // in the body, so `~~~a~~~` is <s>~a</s>~ — please don't "fix" it.
  "~": [{ re: /~~([\s\S]+?)~~/y, build: (m) => mark("strike", m[1]) }],

  // These differ on the character after `<`, so order doesn't matter. IDs stay
  // `\d+` rather than a snowflake length — dev fixtures use short ones.
  "<": [
    {
      re: /<(a)?:(\w+):(\d+)>/y,
      build: (m) => ({ type: "emoji", name: m[2], id: m[3], animated: m[1] === "a" }),
    },
    { re: /<t:(-?\d+)(?::([tTdDfFR]))?>/y, build: buildTimestamp },
    { re: /<@&(\d+)>/y, build: (m) => ({ type: "roleMention", id: m[1] }) },
    { re: /<@!?(\d+)>/y, build: (m) => ({ type: "userMention", id: m[1] }) },
    { re: /<#(\d+)>/y, build: (m) => ({ type: "channelMention", id: m[1] }) },
    { re: /<(https?:\/\/[^\s<>]+)>/y, build: (m) => buildLink(m[1], m[0]) },
  ],

  // The guard stops support@here.example.com growing an @here pill.
  "@": [
    {
      re: /@(everyone|here)\b/y,
      leftGuard: (src, at) => at === 0 || !/[\w@]/.test(src[at - 1]),
      build: (m) => ({ type: "globalMention", name: m[1] as "everyone" | "here" }),
    },
  ],

  // The url group balances one paren level so `…/Foo_(bar)` survives.
  "[": [
    {
      re: /\[((?:[^\][]|\[[^\]]*\])+)\]\(((?:[^()\s]|\([^()\s]*\))+)\)/y,
      build: (m) => buildLink(m[2], m[0], m[1]),
    },
  ],

  // Excludes trailing punctuation via the last character class rather than
  // stripping it afterwards, so `(https://example.com/path.)` keeps the `.)`.
  h: [{ re: /https?:\/\/[^\s<]*[^<.,:;"')\]\s]/y, build: (m) => buildLink(m[0], m[0]) }],
};

/** First character of every rule above. */
const TRIGGERS = new Set(["\\", "`", "|", "*", "_", "~", "<", "@", "[", "h"]);

function parseInline(src: string): MdNode[] {
  const out: MdNode[] = [];
  let buf = "";
  let cursor = 0;

  const flush = () => {
    if (buf) {
      out.push(text(buf));
      buf = "";
    }
  };

  while (cursor < src.length) {
    const char = src[cursor];

    if (char === "\\") {
      RE_ESCAPE.lastIndex = cursor;
      const escaped = RE_ESCAPE.exec(src);
      if (escaped) {
        // Appended rather than flushed, so `a\*b` stays a single text node.
        buf += escaped[1];
        cursor = RE_ESCAPE.lastIndex;
        continue;
      }
    }

    let matched = false;
    for (const rule of INLINE_RULES[char] ?? []) {
      if (rule.leftGuard && !rule.leftGuard(src, cursor)) continue;
      rule.re.lastIndex = cursor;
      const match = rule.re.exec(src);
      // Require forward progress; a zero-length match would spin forever.
      if (!match || rule.re.lastIndex <= cursor) continue;

      // Read this before build(), which may recurse and reset lastIndex.
      const end = rule.re.lastIndex;
      const node = rule.build(match);
      flush(); // before the push, or text comes out in the wrong order
      out.push(node);
      cursor = end;
      matched = true;
      break;
    }
    if (matched) continue;

    // Skip to the next trigger rather than retrying every rule per character.
    let next = cursor + 1;
    while (next < src.length && !TRIGGERS.has(src[next])) next++;
    buf += src.slice(cursor, next);
    cursor = next;
  }

  flush();
  return out;
}

const RE_TRIPLE_QUOTE = /(?:^|\n) *>>> /;
const RE_FENCE = /```(?:([A-Za-z0-9+#._-]*)\n)?([\s\S]*?)```\n?/g;
const RE_HEADING = /^ {0,3}(#{1,3}) (.*)$/;
const RE_SUBTEXT = /^ {0,3}-# (.*)$/;
const RE_QUOTE_LINE = /^ {0,3}>(?!>>) +(.*)$/;

/**
 * Emits block nodes for heading/subtext/quote lines and passes runs of plain
 * lines to the inline scanner together. Only plain runs get rejoined with "\n",
 * so the newline next to a block never becomes a token.
 */
function parseLines(src: string): MdNode[] {
  if (!src) return [];

  const out: MdNode[] = [];
  const lines = src.split("\n");
  let buf: string[] = [];

  const flush = () => {
    if (buf.length) {
      out.push(...parseInline(buf.join("\n")));
      buf = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // The space after the hashes is required, which is what keeps `#hashtag`
    // literal, and has to be a literal space since `\s` would match a newline.
    const heading = RE_HEADING.exec(line);
    if (heading) {
      flush();
      out.push({
        type: "heading",
        level: heading[1].length as 1 | 2 | 3,
        children: parseInline(heading[2]),
      });
      continue;
    }

    const subtext = RE_SUBTEXT.exec(line);
    if (subtext) {
      flush();
      out.push({ type: "subtext", children: parseInline(subtext[1]) });
      continue;
    }

    const quote = RE_QUOTE_LINE.exec(line);
    if (quote) {
      flush();
      const quoted = [quote[1]];
      // Stops at the first non-quote line, so `> a\n\n> b` is two quotes.
      let ahead: RegExpExecArray | null;
      while (i + 1 < lines.length && (ahead = RE_QUOTE_LINE.exec(lines[i + 1]))) {
        quoted.push(ahead[1]);
        i++;
      }
      out.push({ type: "quote", children: parseInline(quoted.join("\n")) });
      continue;
    }

    buf.push(line);
  }

  flush();
  return out;
}

function parseBlocks(src: string, allowTriple: boolean): MdNode[] {
  // `>>> ` quotes everything after it, fences included, so it runs first.
  // Recursing with allowTriple=false terminates and matches Discord, where a
  // nested `>>>` is literal.
  if (allowTriple) {
    const triple = RE_TRIPLE_QUOTE.exec(src);
    if (triple) {
      const head = src.slice(0, triple.index);
      const rest = src.slice(triple.index + triple[0].length);
      const out = head ? parseBlocks(head, false) : [];
      out.push({ type: "quote", children: parseBlocks(rest, false) });
      return out;
    }
  }

  const out: MdNode[] = [];
  let last = 0;

  // matchAll clones the regex, so the recursion above can't touch lastIndex.
  for (const fence of src.matchAll(RE_FENCE)) {
    if (fence.index > last) {
      // Drop the newline that ended the preceding text run.
      out.push(...parseLines(src.slice(last, fence.index).replace(/\n$/, "")));
    }
    out.push({
      type: "codeBlock",
      lang: fence[1] || null,
      // One trailing newline only; trim() would eat leading indentation.
      code: fence[2].replace(/\n$/, ""),
    });
    last = fence.index + fence[0].length;
  }

  if (last < src.length) out.push(...parseLines(src.slice(last)));
  return out;
}

/**
 * These match Discord and are intentional: blocks win over inline markup (so a
 * code span split across a quote line stays literal), lists aren't supported,
 * and unclosed delimiters render as typed.
 */
export function parseDiscordMarkdown(input: string): MdNode[] {
  if (!input) return [];
  // Normalised here so nothing downstream has to deal with "\r".
  return parseBlocks(input.replace(/\r\n?/g, "\n"), true);
}
