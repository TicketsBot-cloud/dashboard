import type { DiscordEmojiTable } from "../discord-emoji/table";

export type MdMark = "bold" | "italic" | "underline" | "strike" | "spoiler";
export type MdTimestampStyle = "t" | "T" | "d" | "D" | "f" | "F" | "s" | "S" | "R";
export type MdGuildNav = "home" | "browse" | "customize" | "guide" | "linked-roles";

export type MdNode =
  | { type: "text"; value: string }
  | { type: "br" }
  | { type: "code"; code: string }
  | { type: "codeBlock"; lang: string | null; code: string }
  | { type: "userMention"; id: string }
  | { type: "roleMention"; id: string }
  | { type: "channelMention"; id: string; messageId?: string; url?: string }
  | { type: "globalMention"; name: "everyone" | "here" }
  | { type: "commandMention"; name: string; id: string }
  | { type: "guildNav"; nav: MdGuildNav }
  | { type: "emoji"; name: string; id: string; animated: boolean }
  | { type: "unicodeEmoji"; surrogate: string; name: string }
  | { type: "timestamp"; unix: number; style: MdTimestampStyle }
  | { type: "mark"; mark: MdMark; children: MdNode[] }
  | { type: "link"; url: string; title?: string; children: MdNode[] }
  | { type: "heading"; level: 1 | 2 | 3; children: MdNode[] }
  | { type: "subtext"; children: MdNode[] }
  | { type: "quote"; children: MdNode[] }
  | { type: "paragraph"; children: MdNode[] }
  | { type: "list"; ordered: boolean; start: number; items: MdNode[][] };

export type MdProfile =
  | "content"
  | "textDisplay"
  | "embedDescription"
  | "embedFieldValue"
  | "embedTitle"
  | "embedTitleNoLinks";

export interface ParseOptions {
  emoji?: DiscordEmojiTable | null;
  legacy?: boolean;
  webhook?: boolean;
}
