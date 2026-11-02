import { parserFor, text } from "./engine";
import type { ParseState } from "./engine";
import { EMBED_TITLE_NO_LINK_RULES, EMBED_TITLE_RULES, RULES } from "./rules";
import type { MdNode, MdProfile, ParseOptions } from "./types";

export type * from "./types";

const PARSERS = {
  full: parserFor(RULES),
  title: parserFor(EMBED_TITLE_RULES),
  titleNoLinks: parserFor(EMBED_TITLE_NO_LINK_RULES),
};

const NODE_LIMIT = 200;
const MAX_JUMBO_EMOJI = 30;

function stateFor(profile: MdProfile, options: ParseOptions): ParseState {
  const base: ParseState = { inline: true, prevCapture: null, emoji: options.emoji ?? null };
  const blocks = !options.legacy;
  switch (profile) {
    case "content":
      return {
        ...base,
        allowLinks: true,
        allowEmojiLinks: options.webhook,
        allowHeading: blocks,
        allowList: blocks,
      };
    case "textDisplay":
      return {
        ...base,
        allowLinks: true,
        allowEmojiLinks: options.webhook,
        allowHeading: true,
        allowList: true,
      };
    case "embedDescription":
      return {
        ...base,
        allowLinks: true,
        allowEmojiLinks: true,
        allowHeading: blocks,
        allowList: blocks,
      };
    case "embedFieldValue":
      return {
        ...base,
        allowLinks: true,
        allowEmojiLinks: true,
        allowHeading: false,
        allowList: blocks,
      };
    case "embedTitle":
    case "embedTitleNoLinks":
      return base;
  }
}

function sameType(parent: MdNode, node: MdNode): boolean {
  if (parent.type !== node.type) return false;
  return parent.type !== "mark" || (node.type === "mark" && parent.mark === node.mark);
}

function postProcess(nodes: MdNode[], parent: MdNode | null): MdNode[] {
  const out: MdNode[] = [];
  for (const original of nodes) {
    let node = original;
    if ("children" in node) node = { ...node, children: postProcess(node.children, node) };
    if (node.type === "list")
      node = { ...node, items: node.items.map((item) => postProcess(item, null)) };

    const flattened =
      parent && "children" in node && sameType(parent, node) ? node.children : [node];
    for (const part of flattened) {
      const last = out[out.length - 1];
      if (part.type === "text" && last?.type === "text")
        out[out.length - 1] = text(last.value + part.value);
      else out.push(part);
    }
  }
  return out.filter((node) => node.type !== "text" || node.value !== "");
}

interface LimitState {
  remaining: number;
  bailed: boolean;
}

function limitNodes(nodes: MdNode[], state: LimitState): MdNode[] {
  const out: MdNode[] = [];
  for (const node of nodes) {
    if (node.type === "text") {
      out.push(node);
      continue;
    }
    state.remaining -= 1;
    if (state.remaining <= 0) {
      state.bailed = true;
      break;
    }
    // Discord's channel mentions hide a channel node inside, which its limit counts too.
    if (node.type === "channelMention" && --state.remaining <= 0) state.bailed = true;
    if ("children" in node) out.push({ ...node, children: limitNodes(node.children, state) });
    else if (node.type === "list")
      out.push({ ...node, items: node.items.map((item) => limitNodes(item, state)) });
    else out.push(node);
  }
  return out;
}

export function parseDiscordMarkdown(
  input: string,
  profile: MdProfile = "content",
  options: ParseOptions = {},
): MdNode[] {
  if (!input) return [];
  const parser =
    profile === "embedTitle"
      ? PARSERS.title
      : profile === "embedTitleNoLinks"
        ? PARSERS.titleNoLinks
        : PARSERS.full;
  const limit: LimitState = { remaining: NODE_LIMIT, bailed: false };
  const nodes = limitNodes(
    postProcess(parser.parse(input, stateFor(profile, options)), null),
    limit,
  );
  if (limit.bailed && profile === "content") return [text(input.replace(/\r\n?/g, "\n"))];
  return nodes;
}

const MARKDOWN_UPDATE_MS = Date.parse("2023-03-22T21:44:40.935Z");

export function isLegacyMarkdown(timestamp: string | undefined): boolean {
  const ms = timestamp ? Date.parse(timestamp) : NaN;
  return Number.isFinite(ms) && ms < MARKDOWN_UPDATE_MS;
}

export function isJumboEmoji(nodes: MdNode[]): boolean {
  let count = 0;
  for (const node of nodes) {
    if (node.type === "emoji" || node.type === "unicodeEmoji") count++;
    else if (node.type === "code" || node.type === "codeBlock") {
      if (node.code.trim() !== "") return false;
    } else if (node.type !== "text" || node.value.trim() !== "") return false;
  }
  return count <= MAX_JUMBO_EMOJI;
}
