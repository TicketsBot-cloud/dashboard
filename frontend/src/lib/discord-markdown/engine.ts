import type { DiscordEmojiTable } from "../discord-emoji/table";
import type { MdNode } from "./types";

export type Capture = { 0: string; [group: number]: string | undefined; length: number };

export interface ParseState {
  inline: boolean;
  prevCapture: Capture | null;
  emoji: DiscordEmojiTable | null;
  _parseDepth?: number;
  _listLevel?: number;
  inQuote?: boolean;
  allowHeading?: boolean;
  allowList?: boolean;
  allowSubtext?: boolean;
  allowLinks?: boolean;
  allowEmojiLinks?: boolean;
  allowEscape?: boolean;
  parseInlineCodeChildContent?: boolean;
  maskedLinkValidation?: { foundNestedMaskedLink: boolean };
}

export type NestedParse = ((source: string, state: ParseState) => MdNode[]) & { rules: RuleSet };

export interface Rule {
  order: number;
  first?: string;
  quality?: (capture: Capture) => number;
  match: (source: string, state: ParseState, prev: string) => Capture | null;
  parse: (capture: Capture, parse: NestedParse, state: ParseState) => MdNode | MdNode[];
}

export type RuleSet = Record<string, Rule>;

const MAX_PARSE_DEPTH = 1000;

export const text = (value: string): MdNode => ({ type: "text", value });

export function preprocess(source: string): string {
  return source.replace(/\r\n?/g, "\n").replace(/\f/g, "").replace(/\t/g, "    ");
}

export const inlineRegex =
  (re: RegExp) =>
  (source: string, state: ParseState): Capture | null =>
    state.inline ? re.exec(source) : null;

export const blockRegex =
  (re: RegExp) =>
  (source: string, state: ParseState): Capture | null =>
    state.inline ? null : re.exec(source);

export const anyScopeRegex =
  (re: RegExp) =>
  (source: string): Capture | null =>
    re.exec(source);

export function parseInline(parse: NestedParse, content: string, state: ParseState): MdNode[] {
  const wasInline = state.inline;
  state.inline = true;
  const result = parse(content, state);
  state.inline = wasInline;
  return result;
}

export interface Parser {
  parse: (source: string, state: ParseState) => MdNode[];
}

export function parserFor(rules: RuleSet): Parser {
  const names = Object.keys(rules).sort((a, b) => {
    const ra = rules[a];
    const rb = rules[b];
    if (ra.order !== rb.order) return ra.order - rb.order;
    const qa = ra.quality ? 0 : 1;
    const qb = rb.quality ? 0 : 1;
    if (qa !== qb) return qa - qb;
    return a < b ? -1 : a > b ? 1 : 0;
  });

  const byFirst = new Map<number, Rule[]>();
  const anywhere: Rule[] = [];
  for (const name of names) {
    const rule = rules[name];
    if (rule.first === undefined) {
      anywhere.push(rule);
      continue;
    }
    for (const char of rule.first) {
      const code = char.charCodeAt(0);
      const list = byFirst.get(code);
      if (list) list.push(rule);
      else byFirst.set(code, [rule]);
    }
  }

  const nested = ((source: string, parentState: ParseState): MdNode[] => {
    const out: MdNode[] = [];
    const depth = (parentState._parseDepth ?? 0) + 1;
    if (depth > MAX_PARSE_DEPTH) {
      if (source) out.push(text(source));
      return out;
    }
    const state: ParseState = { ...parentState, _parseDepth: depth };

    while (source) {
      let best: Rule | null = null;
      let bestCapture: Capture | null = null;
      let bestOrder = 1e5;
      let bestQuality = -1e5;
      const prev = state.prevCapture == null ? "" : state.prevCapture[0];

      for (const list of [byFirst.get(source.charCodeAt(0)), anywhere]) {
        if (!list) continue;
        for (const rule of list) {
          if (rule.order > bestOrder) break;
          const capture = rule.match(source, state, prev);
          if (!capture) continue;
          const quality = rule.quality ? rule.quality(capture) : 0;
          if (rule.order < bestOrder || quality > bestQuality) {
            best = rule;
            bestCapture = capture;
            bestOrder = rule.order;
            bestQuality = quality;
          }
        }
      }

      if (!best || !bestCapture || bestCapture[0].length === 0) {
        out.push(text(source));
        break;
      }

      const parsed = best.parse(bestCapture, nested, state);
      if (Array.isArray(parsed)) out.push(...parsed);
      else out.push(parsed);
      state.prevCapture = bestCapture;
      source = source.substring(bestCapture[0].length);
    }
    return out;
  }) as NestedParse;
  nested.rules = rules;

  return {
    parse: (source, state) => {
      state.prevCapture = null;
      return nested(preprocess(source), state);
    },
  };
}

export function pickRules(rules: RuleSet, names: readonly string[]): RuleSet {
  const out: RuleSet = {};
  for (const name of names) if (rules[name]) out[name] = rules[name];
  return out;
}

export function omitRules(rules: RuleSet, names: readonly string[]): RuleSet {
  const out: RuleSet = { ...rules };
  for (const name of names) delete out[name];
  return out;
}
