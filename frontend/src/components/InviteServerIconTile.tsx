import { useState, type FC } from "react";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus } from "@fortawesome/free-solid-svg-icons";

import { HoverTooltip } from "@/components/HoverTooltip";
import { guildIconUrl } from "@/lib/discord-cdn";
import { getGuildAvatarColor, getGuildInitials } from "@/lib/guild-avatar";
import { buildInviteUrl } from "@/lib/invite";
import type { InvitableGuild } from "@/types";

interface InviteServerIconTileProps {
  guild: InvitableGuild;
  onInviteClick: () => void;
}

const InviteServerIconTile: FC<InviteServerIconTileProps> = ({ guild, onInviteClick }) => {
  const [iconFailed, setIconFailed] = useState(false);
  const label = `Add Tickets to ${guild.name}`;

  return (
    <HoverTooltip label={label} className="relative inline-flex">
      <a
        href={buildInviteUrl(guild.id)}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onInviteClick}
        aria-label={`${label}, opens in a new tab`}
        className="rounded-xl block p-1 transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-900"
      >
        <div className="relative">
          <div className="w-16 h-16 rounded-xl overflow-hidden shrink-0 outline-2 outline-dashed outline-gray-500 outline-offset-2">
            {guild.icon && !iconFailed ? (
              <img
                src={guildIconUrl(guild.id, guild.icon)}
                alt=""
                className="w-full h-full object-cover"
                onError={() => setIconFailed(true)}
              />
            ) : (
              <div
                className="w-full h-full flex items-center justify-center text-white text-base font-medium"
                style={{ backgroundColor: getGuildAvatarColor(guild.id) }}
                aria-hidden="true"
              >
                {getGuildInitials(guild.name)}
              </div>
            )}
          </div>
          <span
            className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border border-gray-600 bg-gray-800 text-gray-300 shadow-sm"
            aria-hidden="true"
          >
            <FontAwesomeIcon icon={faPlus} className="h-2.5 w-2.5" />
          </span>
        </div>
      </a>
    </HoverTooltip>
  );
};

export default InviteServerIconTile;
