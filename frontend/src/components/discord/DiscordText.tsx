import type { FC } from "react";
import DiscordContent from "./DiscordContent";
import type { DiscordContentProps } from "./types";

interface DiscordTextProps {
  content: string;
  raw?: boolean;
  profile?: DiscordContentProps["profile"];
  entities?: DiscordContentProps["entities"];
  webhook?: boolean;
  className?: string;
}

const DiscordText: FC<DiscordTextProps> = ({
  content,
  raw = false,
  profile,
  entities,
  webhook,
  className = "",
}) => {
  if (!raw) {
    return (
      <DiscordContent
        content={content}
        profile={profile}
        entities={entities}
        webhook={webhook}
        className={className}
      />
    );
  }

  if (!content.trim()) {
    return null;
  }

  return (
    <div
      className={`text-gray-200 leading-relaxed whitespace-pre-wrap wrap-break-word ${className}`}
    >
      {content}
    </div>
  );
};

export default DiscordText;
