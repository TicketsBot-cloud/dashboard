import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { CSSProperties, FC, ReactNode } from "react";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBullhorn,
  faComments,
  faHashtag,
  faImage,
  faMessage,
  faTowerBroadcast,
  faVolumeHigh,
} from "@fortawesome/free-solid-svg-icons";
import type { DiscordContentProps } from "./types";
import type { MdGuildNav, MdNode, MdProfile, MdTimestampStyle } from "@/lib/discord-markdown";
import { isJumboEmoji, parseDiscordMarkdown } from "@/lib/discord-markdown";
import { useDiscordEmoji } from "@/lib/discord-emoji";
import { emojiUrl } from "@/lib/discord-cdn";
import { parseAnsi } from "@/lib/discord-ansi";
import {
  formatDiscordTimestamp,
  formatTimestampTooltip,
  relativeRefreshMs,
} from "@/lib/discord-time";
import "./discord-markup.css";

type Entities = DiscordContentProps["entities"];

const MENTION_PILL =
  "bg-blue-600/20 text-blue-300 px-1 rounded hover:bg-blue-600/30 cursor-pointer";
const CHANNEL_PILL =
  "bg-gray-600/20 text-gray-300 px-1 rounded hover:bg-gray-600/30 cursor-pointer";

const MARK_TAGS = {
  bold: "strong",
  italic: "em",
  underline: "u",
  strike: "s",
} as const;

const EMBED_PROFILES = new Set<MdProfile>([
  "embedDescription",
  "embedFieldValue",
  "embedTitle",
  "embedTitleNoLinks",
]);

const NAV_LABELS: Record<MdGuildNav, string> = {
  home: "Server Guide",
  guide: "Server Guide",
  browse: "Browse Channels",
  customize: "Channels & Roles",
  "linked-roles": "Linked Roles",
};

const UNMENTIONABLE_CHANNEL_TYPES = new Set([4, 14]);

const CHANNEL_ICONS: Record<number, IconDefinition> = {
  2: faVolumeHigh,
  5: faBullhorn,
  10: faMessage,
  11: faMessage,
  12: faMessage,
  13: faTowerBroadcast,
  15: faComments,
  16: faImage,
};

const TEXT_EMOJI = new Set([
  "\u00a9",
  "\u00a9\ufe0f",
  "\u00ae",
  "\u00ae\ufe0f",
  "\u2122",
  "\u2122\ufe0f",
]);

const LINK_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:", "sms:"]);

function linkHref(url: string): string | undefined {
  try {
    return LINK_PROTOCOLS.has(new URL(url).protocol) ? url : undefined;
  } catch {
    return undefined;
  }
}

const LinksAllowed = createContext(true);

const BLOCK_NODES = new Set<MdNode["type"]>([
  "codeBlock",
  "quote",
  "list",
  "heading",
  "subtext",
  "paragraph",
]);

const containsBlock = (nodes: MdNode[]): boolean =>
  nodes.some(
    (node) => BLOCK_NODES.has(node.type) || ("children" in node && containsBlock(node.children)),
  );

const Spoiler: FC<{ block: boolean; children: ReactNode }> = ({ block, children }) => {
  const [revealed, setRevealed] = useState(false);
  const display = block ? "block" : "";

  if (revealed) {
    // Still focusable, so revealing with the keyboard doesn't drop focus to <body>.
    return (
      <span tabIndex={-1} className={`bg-gray-700/40 rounded px-0.5 ${display}`}>
        {children}
      </span>
    );
  }

  return (
    <span
      role="button"
      tabIndex={0}
      aria-label="Reveal spoiler"
      className={`bg-gray-700 rounded px-0.5 cursor-pointer select-none ${display}`}
      onClick={(event) => {
        // A spoiler inside a masked link reveals without opening the link.
        event.preventDefault();
        event.stopPropagation();
        setRevealed(true);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          setRevealed(true);
        }
      }}
    >
      <span className="invisible">{children}</span>
    </span>
  );
};

const Timestamp: FC<{ unix: number; style: MdTimestampStyle }> = ({ unix, style }) => {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (style !== "R") return;
    const interval = setInterval(
      () => setNow(new Date()),
      relativeRefreshMs(new Date(unix * 1000), new Date()),
    );
    return () => clearInterval(interval);
  }, [unix, style]);

  return (
    <span className="dm-timestamp" title={formatTimestampTooltip(unix)}>
      {formatDiscordTimestamp(unix, style, now)}
    </span>
  );
};

const AnsiCode: FC<{ code: string }> = ({ code }) => (
  <>
    {parseAnsi(code).map((span, index) => (
      <span
        key={index}
        style={{
          color: span.color,
          backgroundColor: span.background,
          fontWeight: span.bold ? 700 : undefined,
          textDecoration: span.underline ? "underline" : undefined,
        }}
      >
        {span.text}
      </span>
    ))}
  </>
);

function MdNodes({ nodes, entities }: { nodes: MdNode[]; entities: Entities }) {
  return (
    <>
      {nodes.map((node, index) => (
        <MdNodeView key={index} node={node} entities={entities} />
      ))}
    </>
  );
}

// An empty map means the page never loaded that data, not that nothing exists.
function hasEntries(record: Record<string, unknown> | undefined): boolean {
  return record !== undefined && Object.keys(record).length > 0;
}

function ChannelPill({
  id,
  messageId,
  url,
  entities,
}: {
  id: string;
  messageId?: string;
  url?: string;
  entities: Entities;
}) {
  const linksAllowed = useContext(LinksAllowed);
  const channel = entities?.channels[id];
  if (!channel) {
    if (url && linksAllowed) {
      return (
        <a href={linkHref(url)} target="_blank" rel="noopener noreferrer">
          {url}
        </a>
      );
    }
    if (!hasEntries(entities?.channels)) return <span className={CHANNEL_PILL}>#channel</span>;
  }
  if (channel && UNMENTIONABLE_CHANNEL_TYPES.has(channel.type)) return <>#{channel.name}</>;

  return (
    <span className={CHANNEL_PILL}>
      <FontAwesomeIcon
        icon={(channel && CHANNEL_ICONS[channel.type]) ?? faHashtag}
        className="mr-0.5 text-[0.8em]"
      />
      {channel ? channel.name : <em>unknown</em>}
      {messageId && (
        <>
          {" › "}
          <FontAwesomeIcon icon={faMessage} className="text-[0.8em]" />
        </>
      )}
    </span>
  );
}

function MdLink({
  url,
  title,
  nodes,
  entities,
}: {
  url: string;
  title?: string;
  nodes: MdNode[];
  entities: Entities;
}) {
  const linksAllowed = useContext(LinksAllowed);
  const children = <MdNodes nodes={nodes} entities={entities} />;
  if (!linksAllowed) return children;
  return (
    <a href={linkHref(url)} title={title} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

function MdNodeView({ node, entities }: { node: MdNode; entities: Entities }) {
  switch (node.type) {
    case "text":
      return <>{node.value}</>;

    case "br":
      return <br />;

    case "code":
      return <code className="dm-inline-code">{node.code}</code>;

    case "codeBlock":
      return (
        <pre>
          <code>
            {node.lang?.toLowerCase() === "ansi" ? <AnsiCode code={node.code} /> : node.code}
          </code>
        </pre>
      );

    case "mark": {
      if (node.mark === "spoiler") {
        return (
          <Spoiler block={containsBlock(node.children)}>
            <MdNodes nodes={node.children} entities={entities} />
          </Spoiler>
        );
      }
      const Tag = MARK_TAGS[node.mark];
      return (
        <Tag>
          <MdNodes nodes={node.children} entities={entities} />
        </Tag>
      );
    }

    case "heading": {
      const Tag = `h${node.level}` as const;
      return (
        <Tag>
          <MdNodes nodes={node.children} entities={entities} />
        </Tag>
      );
    }

    case "subtext":
      return (
        <small>
          <MdNodes nodes={node.children} entities={entities} />
        </small>
      );

    case "quote":
      return (
        <div className="dm-quote">
          <div className="dm-quote-divider" />
          <blockquote>
            <MdNodes nodes={node.children} entities={entities} />
          </blockquote>
        </div>
      );

    case "paragraph":
      return (
        <p>
          <MdNodes nodes={node.children} entities={entities} />
        </p>
      );

    case "list": {
      const items = node.items.map((item, index) => (
        <li key={index}>
          <MdNodes nodes={item} entities={entities} />
        </li>
      ));
      if (!node.ordered) return <ul>{items}</ul>;
      const digits = String(node.start + node.items.length - 1).length;
      return (
        <ol start={node.start} style={{ "--dm-ol-digits": digits } as CSSProperties}>
          {items}
        </ol>
      );
    }

    case "link":
      return <MdLink url={node.url} title={node.title} nodes={node.children} entities={entities} />;

    case "userMention": {
      const user = entities?.users[node.id];
      return <span className={MENTION_PILL}>{user ? `@${user.username}` : `<@${node.id}>`}</span>;
    }

    case "roleMention": {
      const role = entities?.roles[node.id];
      if (!role) {
        return hasEntries(entities?.roles) ? (
          <>@unknown-role</>
        ) : (
          <span className="px-1 rounded cursor-pointer font-medium text-[#b9bbbe] bg-[rgba(185,187,190,0.1)]">
            {`<@&${node.id}>`}
          </span>
        );
      }
      if (!role.color) return <span className={MENTION_PILL}>@{role.name}</span>;
      const colorHex = `#${role.color.toString(16).padStart(6, "0")}`;
      return (
        <span
          className="px-1 rounded cursor-pointer font-medium"
          style={{ color: colorHex, backgroundColor: `${colorHex}26` }}
        >
          @{role.name}
        </span>
      );
    }

    case "channelMention":
      return (
        <ChannelPill id={node.id} messageId={node.messageId} url={node.url} entities={entities} />
      );

    case "globalMention":
      return <span className={MENTION_PILL}>@{node.name}</span>;

    case "commandMention":
      return <span className={MENTION_PILL}>/{node.name}</span>;

    case "guildNav":
      return <span className={CHANNEL_PILL}>{NAV_LABELS[node.nav]}</span>;

    case "emoji":
      return (
        <img
          src={emojiUrl(node.id, node.animated)}
          alt={`:${node.name}:`}
          title={`:${node.name}:`}
          className="dm-emoji"
          draggable={false}
        />
      );

    case "unicodeEmoji": {
      if (TEXT_EMOJI.has(node.surrogate)) return <>{node.surrogate}</>;
      const label = `:${node.name}:`;
      return (
        <span className="dm-emoji-glyph" role="img" aria-label={label} title={label}>
          {node.surrogate}
        </span>
      );
    }

    case "timestamp":
      // Keyed so an edited timestamp starts from a fresh clock.
      return <Timestamp key={`${node.unix}:${node.style}`} unix={node.unix} style={node.style} />;
  }
}

const DiscordContent: FC<DiscordContentProps> = ({
  content,
  entities,
  profile = "content",
  legacy = false,
  webhook = false,
  className = "",
}) => {
  const emoji = useDiscordEmoji();
  const embed = EMBED_PROFILES.has(profile);
  const source = embed ? content.trim() : content;
  const nodes = useMemo((): MdNode[] => {
    try {
      return parseDiscordMarkdown(source, profile, { emoji, legacy, webhook });
    } catch (error) {
      console.error("Failed to parse Discord markdown", error);
      return [{ type: "text", value: source }];
    }
  }, [source, profile, emoji, legacy, webhook]);

  if (!source.trim()) {
    return null;
  }

  const classes = [
    "discord-markup text-gray-200 leading-[1.375]",
    embed && "discord-markup--embed",
    profile === "content" && isJumboEmoji(nodes) && "discord-markup--jumbo",
    className,
  ];

  return (
    <div className={classes.filter(Boolean).join(" ")}>
      <LinksAllowed.Provider value={profile !== "embedTitleNoLinks"}>
        <MdNodes nodes={nodes} entities={entities} />
      </LinksAllowed.Provider>
    </div>
  );
};

export default DiscordContent;
