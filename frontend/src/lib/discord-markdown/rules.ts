import { splitUnicodeEmoji } from "../discord-emoji/table";
import {
  anyScopeRegex,
  blockRegex,
  inlineRegex,
  omitRules,
  parseInline,
  parserFor,
  pickRules,
  text,
} from "./engine";
import type { Capture, ParseState, Parser, Rule, RuleSet } from "./engine";
import {
  containsDiscordLink,
  foldHomoglyphs,
  isSuspiciousUrl,
  normalizeLink,
  sanitizeFully,
  sanitizeWhitespace,
  unescapeUrl,
} from "./links";
import type { MdGuildNav, MdNode, MdTimestampStyle } from "./types";

const ORDER = {
  heading: 0,
  codeBlock: 4,
  blockQuote: 6,
  list: 7,
  newline: 10,
  paragraph: 11,
  escape: 12,
  autolink: 14,
  mailto: 15,
  url: 16,
  link: 17,
  em: 21,
  inlineCode: 23,
  br: 24,
  text: 25,
};

const LINE_START = /\n$/;

function linkNode(target: string, display: string, title?: string): MdNode {
  return { type: "link", url: target, title, children: [text(display)] };
}

function autolinkNode(capture: Capture): MdNode {
  const link = normalizeLink(capture[1]!);
  return link ? linkNode(link.target, link.display) : text(capture[1]!);
}

const HEADING_RE = /^ *(#{1,3})(?:\s+)((?!\s*#{1,3}\s)[^\n]+?)#*\s*(?:\n|$)/;
const SUBTEXT_RE = /^ *-# +((?!-#)[^\n]+)(?:\n|$)/;
const CODE_BLOCK_RE = /^```(?:([a-z0-9_+\-.#]+?)\n)?\n*([^\n][^]*?)\n*```/i;
const QUOTE_RE = /^( *>>> +([\s\S]*))|^( *>(?!>>) +[^\n]*(\n *>(?!>>) +[^\n]*)*\n?)/;
const QUOTE_PREV = /^$|\n *$/;
const TRIPLE_QUOTE_MARKER = /^ *>>> ?/;
const QUOTE_MARKER = /^ *> ?/gm;

const heading: Rule = {
  order: ORDER.heading,
  first: " #",
  match: (source, state, prev) =>
    state.allowHeading && (prev === "" || LINE_START.test(prev)) ? HEADING_RE.exec(source) : null,
  parse: (capture, parse, state) => ({
    type: "heading",
    level: capture[1]!.length as 1 | 2 | 3,
    children: parseInline(parse, capture[2]!.trim(), state),
  }),
};

const subtext: Rule = {
  order: ORDER.heading,
  first: "-",
  match: (source, state, prev) =>
    state.allowSubtext !== false && (prev === "" || LINE_START.test(prev))
      ? SUBTEXT_RE.exec(source)
      : null,
  parse: (capture, parse, state) => ({
    type: "subtext",
    children: parseInline(parse, capture[1]!.trim(), { ...state, allowSubtext: false }),
  }),
};

const codeBlock: Rule = {
  order: ORDER.codeBlock,
  first: "`",
  match: anyScopeRegex(CODE_BLOCK_RE),
  parse: (capture) => ({ type: "codeBlock", lang: capture[1] || null, code: capture[2] ?? "" }),
};

const blockQuote: Rule = {
  order: ORDER.blockQuote,
  first: " >",
  match: (source, state) => {
    if (state.inQuote) return null;
    if (state.prevCapture == null || QUOTE_PREV.test(state.prevCapture[0]))
      return QUOTE_RE.exec(source);
    return null;
  },
  parse: (capture, parse, state) => {
    const triple = TRIPLE_QUOTE_MARKER.test(capture[0]);
    const content = capture[0].replace(triple ? TRIPLE_QUOTE_MARKER : QUOTE_MARKER, "");
    const wasInQuote = state.inQuote ?? false;
    const wasInline = state.inline;
    state.inQuote = true;
    if (!triple) state.inline = true;
    const children = parse(content, state);
    state.inQuote = wasInQuote;
    state.inline = wasInline;
    if (children.length === 0) children.push(text(" "));
    return { type: "quote", children };
  },
};

const BULLET = "(?:[*-]|\\d+\\.)";
const ITEM_PREFIX = (indent: string) => `(${indent})(${BULLET}) +`;
const ITEM_PREFIX_RE = new RegExp("^" + ITEM_PREFIX(" *"));
const LIST_SOURCE = `^( *)(${BULLET}) [\\s\\S]+?(?:\\n(?! )(?!\\1${BULLET} )|$)`;
const LIST_RE = new RegExp(LIST_SOURCE);
const LIST_AFTER_NEWLINE_RE = new RegExp("^\\n" + LIST_SOURCE.slice(1));
const LIST_PREV = /(?:^|\n)( *)$/;
const LIST_PREV_ENDS_LINE = /\n *$/;
const HORIZONTAL_SPACE_ONLY =
  /^[ \t\v\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+$/;
const MAX_LIST_LEVEL = 11;

const list: Rule = {
  order: ORDER.list,
  first: "\n *-0123456789",
  match: (source, state) => {
    if (!state.allowList || (state._listLevel ?? 0) >= MAX_LIST_LEVEL) return null;
    const prev = state.prevCapture == null ? "" : state.prevCapture[0];
    if (source.charCodeAt(0) === 10) {
      return prev === "" || LIST_PREV_ENDS_LINE.test(prev)
        ? null
        : LIST_AFTER_NEWLINE_RE.exec(source);
    }
    const lineStart = LIST_PREV.exec(prev);
    return lineStart == null || HORIZONTAL_SPACE_ONLY.test(lineStart[0])
      ? null
      : LIST_RE.exec(source);
  },
  parse: (capture, parse, state) => {
    const bullet = capture[2]!;
    const ordered = bullet.length > 1;
    const start = ordered ? Math.min(1e9, Math.max(1, Number(bullet.slice(0, -1)))) : 1;
    const body = capture[0].replace(/^\n/, "").replace(/\n{2,}$/, "\n");
    const prefix = ITEM_PREFIX_RE.exec(body);
    const prefixWidth = prefix ? prefix[0].length : 0;
    const indent = prefix ? prefix[1]!.length : 0;
    // Bullets indented one extra space are siblings; two or more nest.
    const itemRe = new RegExp(
      ITEM_PREFIX(` {${indent},${indent + 1}}`) +
        `[^\\n]*(?:\\n(?! {${indent},${indent + 1}}${BULLET} )[^\\n]*)*(\n|$)`,
      "gm",
    );
    const unindent = new RegExp(`^ {1,${prefixWidth}}`, "gm");
    const rawItems = body.match(itemRe) ?? [];

    let lastWasLoose = false;
    const items = rawItems.map((item, index) => {
      const content = item.replace(ITEM_PREFIX_RE, "").replace(unindent, "");
      const loose = content.includes("\n\n") || (index === rawItems.length - 1 && lastWasLoose);
      lastWasLoose = loose;

      const was = { inline: state.inline, level: state._listLevel };
      state._listLevel = (was.level ?? 0) + 1;
      state.inline = !loose;
      const source = loose ? content.replace(/ *\n$/, "\n\n") : content.replace(/ *\n$/, "");
      const nodes = parse(source, { ...state, allowHeading: false }).map((node) =>
        node.type === "text" && !blockNewlines.has(node)
          ? text(node.value.replace(/\n+\s*$/, ""))
          : node,
      );
      state.inline = was.inline;
      state._listLevel = was.level;
      return nodes;
    });

    return { type: "list", ordered, start, items };
  },
};

const blockNewlines = new WeakSet<MdNode>();

const newline: Rule = {
  order: ORDER.newline,
  first: "\n",
  match: blockRegex(/^(?:\n *)*\n/),
  parse: () => {
    const node = text("\n");
    blockNewlines.add(node);
    return node;
  },
};

const paragraph: Rule = {
  order: ORDER.paragraph,
  match: blockRegex(/^((?:[^\n]|\n(?! *\n))+)(?:\n *)+\n/),
  parse: (capture, parse, state) => ({
    type: "paragraph",
    children: parseInline(parse, capture[1]!, state),
  }),
};

const escape: Rule = {
  order: ORDER.escape,
  first: "\\",
  match: (source, state) =>
    state.allowEscape === false ? null : inlineRegex(/^\\([^0-9A-Za-z\s])/)(source, state),
  parse: (capture) => text(capture[1]!),
};

const autolink: Rule = {
  order: ORDER.autolink,
  first: "<",
  match: inlineRegex(/^<([^: >]+:\/[^ >]+)>/),
  parse: autolinkNode,
};

const mailto: Rule = {
  order: ORDER.mailto,
  first: "<",
  match: inlineRegex(/^<([^\s<>@]+@[^\s<>@]+\.[^\s<>@]+)>/),
  parse: (capture) => {
    const address = capture[1]!;
    return linkNode(address.startsWith("mailto:") ? address : `mailto:${address}`, address);
  },
};

const tel: Rule = {
  order: ORDER.mailto,
  first: "<",
  match: inlineRegex(
    /^<((?:(?:tel|sms):\+?|\+)(?:(?:[0-9]|\([0-9]+\)))(?:[- ./]?(?:[0-9]|\([0-9]+\)))+)>/,
  ),
  parse: (capture) => {
    const number = capture[1]!;
    const target = number.replaceAll(/[ /]+/g, "-");
    return linkNode(
      target.startsWith("tel:") || target.startsWith("sms:") ? target : `tel:${target}`,
      number,
    );
  },
};

// `discord(?:app)?.com`'s unescaped dot is in the client's regex too.
const CHANNEL_URL_RE =
  /^https:\/\/(?:(?:canary\.|ptb\.)?discord(?:app)?.com|staging\.discord\.co)\/channels\/(\d+|@me)(?:\/(\d+|[a-zA-Z-]+))?(?:\/(\d+|[a-zA-Z-]+))?/;
const THREAD_MESSAGE_URL_RE =
  /^https:\/\/(?:(?:canary\.|ptb\.)?discord(?:app)?.com|staging\.discord\.co)\/channels\/(\d+)(?:\/)(\d+)(?:\/threads\/)(\d+)(?:\/)(\d+)/;

const channelOrMessageUrl: Rule = {
  order: ORDER.url - 0.5,
  first: "h",
  match: (source) => {
    const capture = CHANNEL_URL_RE.exec(source);
    if (!capture) return null;
    if (
      (capture[2] != null && /\D/.test(capture[2])) ||
      (capture[3] != null && /\D/.test(capture[3]))
    )
      return null;
    return capture;
  },
  parse: (capture) =>
    capture[2] == null
      ? linkNode(capture[0], capture[0])
      : { type: "channelMention", id: capture[2], messageId: capture[3], url: capture[0] },
};

const mediaPostLink: Rule = {
  order: ORDER.url - 0.5,
  first: "h",
  match: anyScopeRegex(THREAD_MESSAGE_URL_RE),
  // id is the parent channel on purpose: previews don't know threads.
  parse: (capture) => ({
    type: "channelMention",
    id: capture[2]!,
    messageId: capture[4],
    url: capture[0],
  }),
};

const URL_RE = /^((?:https?|steam):\/\/[^\s<]+[^<.,:;"'\]\s])/;

const url: Rule = {
  order: ORDER.url,
  first: "hs",
  match: (source, state) => {
    if (!state.inline) return null;
    const capture = URL_RE.exec(source);
    if (!capture) return null;
    // Only one unmatched trailing ")" is ever dropped.
    let value = capture[0];
    let searchFrom = 0;
    for (let i = value.length - 1; i >= 0 && value[i] === ")"; i--) {
      const open = value.indexOf("(", searchFrom);
      if (open === -1) {
        value = value.slice(0, -1);
        break;
      }
      searchFrom = open + 1;
    }
    capture[0] = capture[1] = value;
    return capture;
  },
  parse: autolinkNode,
};

const LINK_LABEL = "(?:\\[[^\\]]*\\]|[^\\[\\]]|\\](?=[^\\[]*\\]))*";
const LINK_HREF =
  "\\s*<?((?:\\([^)]*\\)|[^\\s\\\\()]|\\\\.)*?)>?(?:\\s+['\"]([\\s\\S]*?)['\"])?\\s*";
const LINK_RE = new RegExp("^\\[(" + LINK_LABEL + ")\\]\\(" + LINK_HREF + "\\)");

type NodeKind = string;

const LABEL_KINDS: NodeKind[] = [
  "text",
  "underline",
  "bold",
  "italic",
  "strike",
  "code",
  "spoiler",
  "br",
  "timestamp",
];
const LABEL_KINDS_WITH_EMOJI: NodeKind[] = [...LABEL_KINDS, "unicodeEmoji", "emoji"];
const BLOCK_KINDS: NodeKind[] = ["list", "heading", "quote", "subtext"];
const TITLE_KINDS: NodeKind[] = [
  "text",
  "underline",
  "bold",
  "italic",
  "strike",
  "code",
  "spoiler",
  "br",
  "timestamp",
  "unicodeEmoji",
  "emoji",
  ...BLOCK_KINDS,
];

const LABEL_RULES = ["text", "u", "strong", "em", "s", "inlineCode", "spoiler", "br", "timestamp"];
const LABEL_RULES_WITH_EMOJI = [...LABEL_RULES, "emoji", "customEmoji"];

const kindOf = (node: MdNode): NodeKind => (node.type === "mark" ? node.mark : node.type);

const codeContent = new WeakMap<MdNode, MdNode[]>();

function nodesAllowed(nodes: MdNode[], kinds: NodeKind[], codeExtra: NodeKind[] = []): boolean {
  for (const node of nodes) {
    if (!kinds.includes(kindOf(node))) return false;
    if (node.type === "code") {
      const inner = codeContent.get(node);
      if (inner && !nodesAllowed(inner, [...kinds, ...codeExtra])) return false;
    }
    if ("children" in node && !nodesAllowed(node.children, kinds)) return false;
  }
  return true;
}

function flattenLabel(nodes: MdNode[]): string {
  let out = "";
  for (const node of nodes) {
    switch (node.type) {
      case "text":
        out += node.value;
        break;
      case "code":
        out += node.code;
        break;
      case "emoji":
        out += `:${node.name}:`;
        break;
      case "unicodeEmoji":
        out += node.surrogate;
        break;
      case "br":
        out += "\n";
        break;
      case "mark":
        out += flattenLabel(node.children);
        break;
      case "timestamp":
        out += "<timestamp>";
        break;
      case "quote":
      case "list":
      case "heading":
      case "subtext":
        out += `<${node.type}Content>`;
        break;
    }
  }
  return out;
}

const labelParsers = new WeakMap<RuleSet, Map<boolean, Parser>>();

function labelParser(rules: RuleSet, withEmoji: boolean): Parser {
  let byEmoji = labelParsers.get(rules);
  if (!byEmoji) labelParsers.set(rules, (byEmoji = new Map()));
  let parser = byEmoji.get(withEmoji);
  if (!parser) {
    parser = parserFor(pickRules(rules, withEmoji ? LABEL_RULES_WITH_EMOJI : LABEL_RULES));
    byEmoji.set(withEmoji, parser);
  }
  return parser;
}

function tooManyBrackets(source: string): boolean {
  let depth = 0;
  let sinceParen = 0;
  let deep = 0;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (depth >= 2) {
      if (++deep > 100) return true;
    } else {
      deep = 0;
    }
    if (char === ")") {
      sinceParen = 0;
      continue;
    }
    if (char === "[") {
      if (++depth > 10) return true;
    } else if (char === "]") {
      if (depth > 0) depth--;
    } else if (char !== "(") {
      continue;
    }
    if (++sinceParen > 200) return true;
  }
  return false;
}

const link: Rule = {
  order: ORDER.link,
  first: "[",
  match: (source, state) => {
    if (!state.allowLinks || !source.includes("](") || tooManyBrackets(source)) return null;
    return inlineRegex(LINK_RE)(source, state);
  },
  parse: (capture, parse, state) => {
    const [all, rawLabel = "", rawUrl = "", rawTitle] = capture as unknown as string[];
    const asText = () => text(all);

    if (state.maskedLinkValidation) {
      state.maskedLinkValidation.foundNestedMaskedLink = true;
      return asText();
    }
    if (isSuspiciousUrl(rawUrl)) return asText();

    const urlClean = sanitizeWhitespace(rawUrl);
    const labelClean = sanitizeWhitespace(rawLabel);
    const label = sanitizeFully(rawLabel);
    const title = sanitizeFully(rawTitle ?? "");
    if (!urlClean.trim() || !label.trim()) return asText();

    const normalized = normalizeLink(unescapeUrl(rawUrl));
    if (!normalized || (rawTitle != null && containsDiscordLink(foldHomoglyphs(rawTitle))))
      return asText();

    const labelState: ParseState = {
      ...state,
      allowEscape: false,
      parseInlineCodeChildContent: true,
    };
    const validation = { foundNestedMaskedLink: false };
    const validationState: ParseState = { ...labelState, maskedLinkValidation: validation };
    const kinds = state.allowEmojiLinks ? LABEL_KINDS_WITH_EMOJI : LABEL_KINDS;
    const allowed = [...kinds, ...BLOCK_KINDS];

    const labelNodes = parse(label, validationState);
    if (validation.foundNestedMaskedLink || !nodesAllowed(labelNodes, allowed, ["unicodeEmoji"])) {
      return asText();
    }
    const titleNodes = parse(title, validationState);
    if (validation.foundNestedMaskedLink || !nodesAllowed(titleNodes, TITLE_KINDS)) return asText();

    const flat = flattenLabel(labelNodes);
    if (!flat.trim() || containsDiscordLink(flat)) return asText();
    if (flat !== label) {
      if (containsDiscordLink(label)) return asText();
      const reparsed = parse(flat, validationState);
      if (
        validation.foundNestedMaskedLink ||
        !nodesAllowed(reparsed, [...allowed, "unicodeEmoji"])
      ) {
        return asText();
      }
    }

    const children = labelParser(parse.rules, !!state.allowEmojiLinks).parse(
      labelClean,
      labelState,
    );
    const shownTitle = sanitizeWhitespace(rawTitle ?? "");
    return { type: "link", url: normalized.target, title: shownTitle || undefined, children };
  },
};

const EM_RE =
  /^\b_((?:__|\\[\s\S]|[^\\_])+?)_\b|^\*(?=\S)((?:\*\*|\\[\s\S]|\s+(?:\\[\s\S]|[^\s*\\]|\*\*)|[^\s*\\])+?)\*(?!\*)/;
const LOOSE_EM_RE =
  /^\*(?=\S)((?:\*\*|\\[\s\S]|\s+(?:\\[\s\S]|[^\s*\\]|\*\*)|[^\s*\\])+?) {1,2}\*(?!\*)/;

const em: Rule = {
  order: ORDER.em,
  quality: (capture) => capture[0].length + 0.2,
  match: inlineRegex(EM_RE),
  parse: (capture, parse, state) => ({
    type: "mark",
    mark: "italic",
    children: parse(capture[2] || capture[1]!, state),
  }),
};

const looseEm: Rule = {
  order: ORDER.em,
  quality: (capture) => capture[0].length + 0.2,
  match: inlineRegex(LOOSE_EM_RE),
  parse: (capture, parse, state) => ({
    type: "mark",
    mark: "italic",
    children: parse(capture[1]!, state),
  }),
};

const strong: Rule = {
  order: ORDER.em,
  first: "*",
  quality: (capture) => capture[0].length + 0.1,
  match: inlineRegex(/^\*\*((?:\\[\s\S]|[^\\])+?)\*\*(?!\*)/),
  parse: (capture, parse, state) => ({
    type: "mark",
    mark: "bold",
    children: parseInline(parse, capture[1]!, state),
  }),
};

const u: Rule = {
  order: ORDER.em,
  first: "_",
  quality: (capture) => capture[0].length,
  match: inlineRegex(/^__((?:\\[\s\S]|[^\\])+?)__(?!_)/),
  parse: (capture, parse, state) => ({
    type: "mark",
    mark: "underline",
    children: parseInline(parse, capture[1]!, state),
  }),
};

const s: Rule = {
  order: ORDER.em,
  first: "~",
  match: inlineRegex(/^~~([\s\S]+?)~~(?!_)/),
  parse: (capture, parse, state) => ({
    type: "mark",
    mark: "strike",
    children: parseInline(parse, capture[1]!, state),
  }),
};

const BACKTICK = 96;

// Hand-written: the equivalent regex backtracks cubically on long backtick runs.
function matchInlineCode(source: string): Capture | null {
  let open = 0;
  while (source.charCodeAt(open) === BACKTICK) open++;
  if (open === 0 || source.indexOf("`", open) === -1) return null;

  const runs: [start: number, length: number][] = [];
  for (let i = open; i < source.length; ) {
    if (source.charCodeAt(i) !== BACKTICK) {
      i++;
      continue;
    }
    let end = i;
    while (source.charCodeAt(end) === BACKTICK) end++;
    runs.push([i, end - i]);
    i = end;
  }

  for (let size = open; size >= 1; size--) {
    const closer = runs.find(([, length]) => length === size);
    if (closer) {
      const [start] = closer;
      return [source.slice(0, start + size), source.slice(0, size), source.slice(size, start)];
    }
  }
  return null;
}

const inlineCode: Rule = {
  order: ORDER.inlineCode,
  first: "`",
  match: (source, state) => (state.inline ? matchInlineCode(source) : null),
  parse: (capture, parse, state) => {
    const node: MdNode = { type: "code", code: capture[2]!.replace(/^ (?= *`)|(` *) $/g, "$1") };
    if (state.parseInlineCodeChildContent) codeContent.set(node, parse(node.code, state));
    return node;
  },
};

const br: Rule = {
  order: ORDER.br,
  first: " ",
  match: anyScopeRegex(/^ {2,}\n/),
  parse: () => ({ type: "br" }),
};

const MAX_DATE_MS = 8.64e15;
const TIMESTAMP_RE = /^<t:(-?\d{1,17})(?::(t|T|d|D|f|F|s|S|R))?>/;

const timestamp: Rule = {
  order: ORDER.text - 1,
  first: "<",
  match: anyScopeRegex(TIMESTAMP_RE),
  parse: (capture) => {
    const unix = Number(capture[1]);
    if (!Number.isFinite(unix * 1000) || Math.abs(unix * 1000) > MAX_DATE_MS)
      return text(capture[0]);
    return { type: "timestamp", unix, style: (capture[2] as MdTimestampStyle | undefined) ?? "f" };
  },
};

const TEXT_RE = /^[\s\S]+?(?=[^0-9A-Za-z\s\u00c0-\uffff]|\n\n| {2,}\n|\w+:\S|[0-9]+\.|$)/;

const textRule: Rule = {
  order: ORDER.text,
  match: anyScopeRegex(TEXT_RE),
  parse: (capture, _parse, state) => {
    if (!state.emoji) return text(capture[0]);
    return splitUnicodeEmoji(capture[0], state.emoji).map(
      (part): MdNode =>
        part.emoji
          ? { type: "unicodeEmoji", surrogate: part.surrogate, name: part.name }
          : text(part.text),
    );
  },
};

const EMOJI_NAME_RE = /^:([^\s:]+?(?:::skin-tone-\d)?):/;

const emoji: Rule = {
  order: ORDER.text,
  first: ":",
  match: (source, state) => {
    if (!state.emoji) return null;
    const capture = EMOJI_NAME_RE.exec(source);
    return capture && state.emoji.names.has(capture[1]!) ? capture : null;
  },
  parse: (capture, _parse, state) => ({
    type: "unicodeEmoji",
    surrogate: state.emoji!.names.get(capture[1]!)!,
    name: capture[1]!,
  }),
};

const customEmoji: Rule = {
  order: ORDER.codeBlock,
  first: "<",
  match: anyScopeRegex(/^<(a)?:(\w+):(\d+)>/),
  parse: (capture) => ({
    type: "emoji",
    name: capture[2]!,
    id: capture[3]!,
    animated: capture[1] === "a",
  }),
};

// Kept as text so the escape rule can't eat its backslash.
const emoticon: Rule = {
  order: ORDER.text,
  first: "\u00af",
  match: anyScopeRegex(/^(\u00af\\_\(\u30c4\)_\/\u00af)/),
  parse: (capture) => text(capture[1]!),
};

const roleMention: Rule = {
  order: ORDER.text,
  first: "<",
  match: anyScopeRegex(/^<@&(\d+)>/),
  parse: (capture) => ({ type: "roleMention", id: capture[1]! }),
};

const mention: Rule = {
  order: ORDER.text,
  first: "<@",
  match: anyScopeRegex(/^<@!?(\d+)>|^(@(?:everyone|here))/),
  parse: (capture) =>
    capture[1] != null
      ? { type: "userMention", id: capture[1] }
      : { type: "globalMention", name: capture[2] === "@everyone" ? "everyone" : "here" },
};

const channelMention: Rule = {
  order: ORDER.text,
  first: "<",
  match: anyScopeRegex(/^<#(\d+)>/),
  parse: (capture) => ({ type: "channelMention", id: capture[1]! }),
};

const COMMAND_WORD = "[-_\\p{Letter}\\p{Number}\\p{sc=Deva}\\p{sc=Thai}]{1,32}";
const COMMAND_RE = new RegExp(
  `^<\\/(${COMMAND_WORD}(?: ${COMMAND_WORD})?(?: ${COMMAND_WORD})?):(\\d+)>`,
  "u",
);

const commandMention: Rule = {
  order: ORDER.text,
  first: "<",
  match: anyScopeRegex(COMMAND_RE),
  parse: (capture) => ({ type: "commandMention", name: capture[1]!, id: capture[2]! }),
};

const spoiler: Rule = {
  order: ORDER.text,
  first: "|",
  match: anyScopeRegex(/^\|\|([\s\S]+?)\|\|/),
  parse: (capture, parse, state) => ({
    type: "mark",
    mark: "spoiler",
    children: parse(capture[1]!, state),
  }),
};

const staticRouteLink: Rule = {
  order: ORDER.text,
  first: "<",
  match: anyScopeRegex(/^<id:(home|browse|customize|guide|linked-roles)(?::(\d+))?>/),
  parse: (capture) => ({ type: "guildNav", nav: capture[1] as MdGuildNav }),
};

export const RULES: RuleSet = {
  heading,
  subtext,
  codeBlock,
  customEmoji,
  blockQuote,
  list,
  newline,
  paragraph,
  escape,
  autolink,
  mailto,
  tel,
  channelOrMessageUrl,
  mediaPostLink,
  url,
  link,
  em,
  looseEm,
  strong,
  u,
  s,
  inlineCode,
  br,
  timestamp,
  text: textRule,
  emoji,
  emoticon,
  roleMention,
  mention,
  channelMention,
  commandMention,
  spoiler,
  staticRouteLink,
};

export const EMBED_TITLE_RULES = omitRules(RULES, [
  "codeBlock",
  "br",
  "mention",
  "roleMention",
  "subtext",
]);

export const EMBED_TITLE_NO_LINK_RULES = omitRules(EMBED_TITLE_RULES, [
  "url",
  "autolink",
  "link",
  "mailto",
  "tel",
]);
