import { memo } from "react";
import type { FC } from "react";
import type { DiscordEmbedProps } from "./types";
import { isSafeUrl } from "@/lib/url";
import DiscordContent from "./DiscordContent";

const DiscordEmbedComponent: FC<DiscordEmbedProps> = ({ embed, entities, className = "" }) => {
  const formatTimestamp = (timestamp: string): string => {
    return new Date(timestamp).toLocaleDateString([], {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div
      className={`bg-gray-800 border-l-4 rounded-r p-4 mt-2 max-w-lg ${className}`}
      style={{
        borderColor: embed.color ? `#${embed.color.toString(16).padStart(6, "0")}` : "#718096",
      }}
    >
      {embed.author && (
        <div className="flex items-center gap-2 mb-2">
          {embed.author.icon_url && (
            <img src={embed.author.icon_url} alt="" className="w-6 h-6 rounded-full" />
          )}
          <div className="text-sm text-gray-300">
            {embed.author.url && isSafeUrl(embed.author.url) ? (
              <a
                href={embed.author.url}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline"
              >
                {embed.author.name}
              </a>
            ) : (
              embed.author.name
            )}
          </div>
        </div>
      )}

      {embed.title && (
        <div className="mb-2">
          {embed.url && isSafeUrl(embed.url) ? (
            <a href={embed.url} target="_blank" rel="noopener noreferrer">
              <DiscordContent
                content={embed.title}
                entities={entities}
                className="text-blue-400! hover:underline font-semibold text-lg"
              />
            </a>
          ) : (
            <DiscordContent
              content={embed.title}
              entities={entities}
              className="text-white font-semibold text-lg"
            />
          )}
        </div>
      )}

      {embed.description && (
        <DiscordContent
          content={embed.description}
          entities={entities}
          className="text-gray-300 text-sm mb-3"
        />
      )}

      {embed.fields && embed.fields.length > 0 && (
        <div className="grid gap-2 mb-3">
          {embed.fields.map((field, index) => (
            <div
              key={index}
              className={field.inline ? "inline-block mr-4 mb-2 min-w-37.5 max-w-50" : "mb-2"}
            >
              <DiscordContent
                content={field.name}
                entities={entities}
                className="text-white font-semibold text-sm mb-1"
              />
              <DiscordContent
                content={field.value}
                entities={entities}
                className="text-gray-300 text-sm"
              />
            </div>
          ))}
        </div>
      )}

      {embed.image && (
        <div className="mb-3">
          <img
            src={embed.image.url}
            alt=""
            className="rounded max-w-full max-h-72 h-auto object-contain"
          />
        </div>
      )}

      {embed.thumbnail && (
        <div className="float-right ml-4 mb-2">
          <img
            src={embed.thumbnail.url}
            alt=""
            className="rounded max-w-20 max-h-20"
            style={{
              width: embed.thumbnail.width ? `${embed.thumbnail.width}px` : "80px",
              height: embed.thumbnail.height ? `${embed.thumbnail.height}px` : "80px",
            }}
          />
        </div>
      )}

      {embed.footer && (
        <div className="flex items-center gap-2 mt-3 pt-2 border-t border-gray-700">
          {embed.footer.icon_url && (
            <img src={embed.footer.icon_url} alt="" className="w-5 h-5 rounded-full" />
          )}
          <div className="text-xs text-gray-400">
            {embed.footer.text}
            {embed.timestamp && <span className="ml-2">• {formatTimestamp(embed.timestamp)}</span>}
          </div>
        </div>
      )}
    </div>
  );
};

const DiscordEmbed = memo(DiscordEmbedComponent);

export default DiscordEmbed;
