import type { FC } from "react";
import type { DiscordAuthorProps } from "./types";
import { userAvatarUrl } from "@/lib/discord-cdn";

const DiscordAuthor: FC<DiscordAuthorProps> = ({
  user,
  timestamp,
  compact = false,
  className = "",
}) => {
  const getAvatarUrl = (userId: string, avatarValue?: string | null): string =>
    userAvatarUrl(userId, avatarValue);

  const formatTimestamp = (timestamp: string): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

    if (diffInHours < 24) {
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } else if (diffInHours < 24 * 7) {
      return date.toLocaleDateString([], { weekday: "short", hour: "2-digit", minute: "2-digit" });
    } else {
      return date.toLocaleDateString([], {
        month: "2-digit",
        day: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    }
  };

  if (compact) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <img
          src={getAvatarUrl(user.id, user.avatar)}
          alt={`${user.username}'s avatar`}
          className="w-4 h-4 rounded-full shrink-0"
        />
        <span className="text-sm font-medium text-white hover:underline cursor-pointer">
          {user.username}
        </span>
        {timestamp && <span className="text-xs text-gray-400">{formatTimestamp(timestamp)}</span>}
      </div>
    );
  }

  return (
    <div className={`flex items-start gap-4 ${className}`}>
      <img
        src={getAvatarUrl(user.id, user.avatar)}
        alt={`${user.username}'s avatar`}
        className="w-10 h-10 rounded-full shrink-0 mt-0.5"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 mb-1">
          <span className="font-medium text-white hover:underline cursor-pointer">
            {user.username}
          </span>
          {user.bot && (
            <span className="bg-blue-600 text-white text-xs px-1.5 py-0.5 rounded font-medium">
              APP
            </span>
          )}
          {timestamp && <span className="text-xs text-gray-400">{formatTimestamp(timestamp)}</span>}
        </div>
      </div>
    </div>
  );
};

export default DiscordAuthor;
