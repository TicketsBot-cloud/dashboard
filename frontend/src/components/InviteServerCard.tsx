import { useState, type FC } from "react";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowUpRightFromSquare } from "@fortawesome/free-solid-svg-icons";

import { guildIconUrl } from "@/lib/discord-cdn";
import { getGuildAvatarColor, getGuildInitials } from "@/lib/guild-avatar";
import { buildInviteUrl } from "@/lib/invite";
import type { InvitableGuild } from "@/types";

interface InviteServerCardProps {
  guild: InvitableGuild;
  onInviteClick: () => void;
}

const InviteServerCard: FC<InviteServerCardProps> = ({ guild, onInviteClick }) => {
  const [iconFailed, setIconFailed] = useState(false);

  return (
    <a
      href={buildInviteUrl(guild.id)}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onInviteClick}
      aria-label={`Add Tickets to ${guild.name}, opens in a new tab`}
      className="h-full focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-900 rounded-lg block w-full"
    >
      <article className="flex items-center gap-4 rounded-lg border border-dashed border-gray-600 p-4 h-full hover:border-gray-500 hover:bg-gray-800 transition">
        <div className="w-12 h-12 rounded-md overflow-hidden shrink-0">
          {guild.icon && !iconFailed ? (
            <img
              src={guildIconUrl(guild.id, guild.icon)}
              alt=""
              className="w-full h-full object-cover"
              onError={() => setIconFailed(true)}
            />
          ) : (
            <div
              className="w-full h-full flex items-center justify-center text-white text-sm font-medium"
              style={{ backgroundColor: getGuildAvatarColor(guild.id) }}
              aria-hidden="true"
            >
              {getGuildInitials(guild.name)}
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-medium truncate">{guild.name}</h3>
          <span className="mt-1 inline-flex items-center gap-1 text-sm text-blue-400">
            Add Tickets
            <FontAwesomeIcon
              icon={faArrowUpRightFromSquare}
              className="h-3 w-3"
              aria-hidden="true"
            />
          </span>
        </div>
      </article>
    </a>
  );
};

export default InviteServerCard;
