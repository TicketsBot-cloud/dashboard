import { memo } from "react";
import type { FC } from "react";
import type { DiscordMessageProps } from "./types";
import DiscordAuthor from "./DiscordAuthor";
import DiscordContent from "./DiscordContent";
import DiscordEmbed from "./DiscordEmbed";
import DiscordComponents from "./DiscordComponents";

const DiscordMessageComponent: FC<DiscordMessageProps> = ({
  message,
  entities,
  compact = false,
  showTimestamp = true,
  className = "",
}) => {
  const hasContent = message.content && message.content.trim().length > 0;
  const hasEmbeds = message.embeds && message.embeds.length > 0;
  const hasComponents = message.components && message.components.length > 0;
  const hasAttachments = message.attachments && message.attachments.length > 0;

  const resolvedUser = entities?.users[message.author] ?? {
    id: message.author,
    username: "Unknown User",
    avatar: "",
    bot: false,
    admin_tier: "",
  };

  if (compact) {
    return (
      <div className={`flex items-start gap-2 px-4 py-1 group ${className} w-full`}>
        <div className="text-xs text-gray-500 w-16 text-right shrink-0 mt-0.5">
          {showTimestamp && message.timestamp && (
            <span className="opacity-0 group-hover:opacity-100 transition-opacity">
              {new Date(message.timestamp).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <DiscordAuthor
            user={resolvedUser}
            timestamp={showTimestamp ? message.timestamp : undefined}
            compact={true}
          />
          {hasContent && (
            <DiscordContent entities={entities} content={message.content} className="mt-1" />
          )}
          {hasEmbeds &&
            message.embeds.map((embed, index) => (
              <DiscordEmbed key={index} embed={embed} entities={entities} />
            ))}
          {hasComponents && (
            <DiscordComponents entities={entities} components={message.components || []} />
          )}
          {hasAttachments && (
            <div className="mt-2">
              {message.attachments.map((attachment, index) => (
                <div key={index} className="bg-gray-800 rounded p-3 mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-blue-400">📎</span>
                    <a
                      href={attachment.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:underline text-sm"
                    >
                      {attachment.filename}
                    </a>
                    <span className="text-xs text-gray-400">
                      ({Math.round(attachment.size / 1024)} KB)
                    </span>
                  </div>
                  {(attachment.content_type?.startsWith("image/") ||
                    (attachment.height && attachment.width)) && (
                    <img
                      src={attachment.url}
                      alt={attachment.filename}
                      className="mt-2 rounded max-w-full sm:max-w-sm max-h-64 object-contain"
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`px-4 py-2 ${className}`}>
      <DiscordAuthor
        user={resolvedUser}
        timestamp={showTimestamp ? message.timestamp : undefined}
        compact={false}
      />
      <div className="ml-14 -mt-4">
        {hasContent && <DiscordContent entities={entities} content={message.content} />}
        {hasEmbeds &&
          message.embeds.map((embed, index) => (
            <DiscordEmbed key={index} embed={embed} entities={entities} />
          ))}
        {hasComponents && (
          <DiscordComponents entities={entities} components={message.components || []} />
        )}
        {hasAttachments && (
          <div className="mt-2">
            {message.attachments.map((attachment, index) => (
              <div key={index} className="bg-gray-800 rounded p-3 mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-blue-400">📎</span>
                  <a
                    href={attachment.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:underline text-sm"
                  >
                    {attachment.filename}
                  </a>
                  <span className="text-xs text-gray-400">
                    ({Math.round(attachment.size / 1024)} KB)
                  </span>
                </div>
                {(attachment.content_type?.startsWith("image/") ||
                  (attachment.height && attachment.width)) && (
                  <img
                    src={attachment.url}
                    alt={attachment.filename}
                    className="mt-2 rounded max-w-full sm:max-w-sm max-h-64 object-contain"
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// Memoize the component to prevent unnecessary re-renders
const DiscordMessage = memo(DiscordMessageComponent, (prevProps, nextProps) => {
  // Custom comparison function for better performance.
  // `entities` has to be in here — the ticket view fills it in a second time
  // after the member fetch, and skipping it leaves mentions as raw <@id>.
  return (
    prevProps.message.id === nextProps.message.id &&
    prevProps.message.content === nextProps.message.content &&
    prevProps.entities === nextProps.entities &&
    prevProps.compact === nextProps.compact &&
    prevProps.showTimestamp === nextProps.showTimestamp &&
    prevProps.className === nextProps.className
  );
});

export default DiscordMessage;
