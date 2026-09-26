import { useState, type FC } from "react";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowUpRightFromSquare } from "@fortawesome/free-solid-svg-icons";

import { buttonLinkClassName } from "@/components/Button";
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
    <article className="flex items-center gap-4 rounded-lg border border-dashed border-gray-600 p-4 h-full">
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
      <h3 className="flex-1 min-w-0 font-medium truncate">{guild.name}</h3>
      <a
        href={buildInviteUrl(guild.id)}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onInviteClick}
        aria-label={`Add bot to ${guild.name}, opens in a new tab`}
        className={`${buttonLinkClassName("outline", "sm")} shrink-0 whitespace-nowrap`}
      >
        Add bot
        <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="h-3 w-3" aria-hidden="true" />
      </a>
    </article>
  );
};

export default InviteServerCard;
