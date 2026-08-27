import { useMemo, useState } from "react";
import type { FC, ReactNode } from "react";
import type { DiscordContentProps } from "./types";
import type { MdMark, MdNode } from "@/lib/discord-markdown";
import { parseDiscordMarkdown } from "@/lib/discord-markdown";
import { emojiUrl } from "@/lib/discord-cdn";

type Entities = DiscordContentProps["entities"];

const MENTION_PILL =
  "bg-blue-600/20 text-blue-300 px-1 rounded hover:bg-blue-600/30 cursor-pointer";

const MARK_TAGS = {
  bold: "strong",
  italic: "em",
  underline: "span",
  strike: "span",
} as const satisfies Record<Exclude<MdMark, "spoiler">, "strong" | "em" | "span">;

const MARK_CLASSES = {
  bold: "font-bold",
  italic: "italic",
  underline: "underline",
  strike: "line-through",
} as const satisfies Record<Exclude<MdMark, "spoiler">, string>;

const HEADING_CLASSES = {
  1: "text-2xl font-bold mt-2 mb-1",
  2: "text-xl font-bold mt-2 mb-1",
  3: "text-lg font-bold mt-2 mb-1",
} as const satisfies Record<1 | 2 | 3, string>;

const Spoiler: FC<{ children: ReactNode }> = ({ children }) => {
  const [revealed, setRevealed] = useState(false);

  if (revealed) {
    return <span className="bg-gray-700/40 rounded px-0.5">{children}</span>;
  }

  return (
    <span
      role="button"
      tabIndex={0}
      aria-label="Reveal spoiler"
      className="bg-gray-700 text-transparent rounded px-0.5 cursor-pointer select-none"
      onClick={() => setRevealed(true)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          setRevealed(true);
        }
      }}
    >
      {children}
    </span>
  );
};

function MdNodes({ nodes, entities }: { nodes: MdNode[]; entities: Entities }) {
  return (
    <>
      {nodes.map((node, index) => (
        <MdNodeView key={index} node={node} entities={entities} />
      ))}
    </>
  );
}

function MdNodeView({ node, entities }: { node: MdNode; entities: Entities }) {
  switch (node.type) {
    case "text":
      return <>{node.value}</>;

    case "code":
      return (
        <code className="bg-gray-800 text-gray-200 px-1.5 py-0.5 rounded text-sm font-mono">
          {node.code}
        </code>
      );

    case "codeBlock":
      return (
        <pre className="bg-gray-900 border border-gray-700 rounded p-3 mt-1 mb-1 overflow-x-auto">
          <code className="text-sm font-mono text-gray-200">{node.code}</code>
        </pre>
      );

    case "mark": {
      if (node.mark === "spoiler") {
        return (
          <Spoiler>
            <MdNodes nodes={node.children} entities={entities} />
          </Spoiler>
        );
      }
      const Tag = MARK_TAGS[node.mark];
      return (
        <Tag className={MARK_CLASSES[node.mark]}>
          <MdNodes nodes={node.children} entities={entities} />
        </Tag>
      );
    }

    case "heading":
      return (
        <div className={HEADING_CLASSES[node.level]}>
          <MdNodes nodes={node.children} entities={entities} />
        </div>
      );

    case "subtext":
      return (
        <div className="text-xs text-gray-400">
          <MdNodes nodes={node.children} entities={entities} />
        </div>
      );

    case "quote":
      return (
        <div className="border-l-4 border-gray-600 pl-3 my-1">
          <MdNodes nodes={node.children} entities={entities} />
        </div>
      );

    case "link":
      return (
        <a
          href={node.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-400 underline hover:text-blue-300"
        >
          <MdNodes nodes={node.children} entities={entities} />
        </a>
      );

    case "userMention": {
      const user = entities?.users[node.id];
      return <span className={MENTION_PILL}>{user ? `@${user.username}` : `<@${node.id}>`}</span>;
    }

    case "roleMention": {
      const role = entities?.roles[node.id];
      const colorHex = role?.color ? `#${role.color.toString(16).padStart(6, "0")}` : null;
      return (
        <span
          className="px-1 rounded cursor-pointer font-medium"
          style={
            colorHex
              ? { color: colorHex, backgroundColor: `${colorHex}26` }
              : { color: "#b9bbbe", backgroundColor: "rgba(185,187,190,0.1)" }
          }
        >
          {role ? `@${role.name}` : `<@&${node.id}>`}
        </span>
      );
    }

    case "channelMention":
      return (
        <span className="bg-gray-600/20 text-gray-300 px-1 rounded hover:bg-gray-600/30 cursor-pointer">
          #{entities?.channels[node.id]?.name || "channel"}
        </span>
      );

    case "globalMention":
      return <span className={MENTION_PILL}>@{node.name}</span>;

    case "emoji":
      return (
        <img
          src={emojiUrl(node.id, node.animated)}
          alt={`:${node.name}:`}
          title={`:${node.name}:`}
          className="inline-block w-5 h-5 align-[-0.25em]"
        />
      );

    // Every style renders as an absolute date for now; `style` is kept on the
    // node so the relative format can be added without touching the parser.
    case "timestamp":
      return (
        <span className="bg-gray-600/30 rounded px-1">
          {new Date(node.unix * 1000).toLocaleString()}
        </span>
      );
  }
}

const DiscordContent: FC<DiscordContentProps> = ({ content, entities, className = "" }) => {
  const nodes = useMemo(() => parseDiscordMarkdown(content), [content]);

  if (!content.trim()) {
    return null;
  }

  return (
    <div
      className={`text-gray-200 leading-relaxed whitespace-pre-wrap wrap-break-word ${className}`}
    >
      <MdNodes nodes={nodes} entities={entities} />
    </div>
  );
};

export default DiscordContent;
