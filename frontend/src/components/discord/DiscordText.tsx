import type { FC } from "react";
import DiscordContent from "./DiscordContent";

interface DiscordTextProps {
  content: string;
  raw?: boolean;
  className?: string;
}

const DiscordText: FC<DiscordTextProps> = ({ content, raw = false, className = "" }) => {
  if (!raw) {
    return <DiscordContent content={content} className={className} />;
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
