import { useState, type FC } from "react";

import { Link } from "react-router";
import { guildIconUrl } from "@/lib/discord-cdn";
import { getGuildAvatarColor, getGuildInitials } from "@/lib/guild-avatar";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import {
  getGuildPermissionLevelDescription,
  getGuildPermissionLevelLabel,
} from "@/lib/guild-permission";
import { useGuildStore } from "@/stores/guild";
import DashboardAccessRequiredModal from "@/components/modals/DashboardAccessRequiredModal";
import type { Guild } from "@/types";

interface ServerProps {
  guild: Guild;
}

const Server: FC<ServerProps> = ({ guild }) => {
  const { selectGuild } = useGuildStore();
  const disabled = guild.permission_level === 0;
  const [iconFailed, setIconFailed] = useState(false);
  const [accessModalOpen, setAccessModalOpen] = useState(false);

  const avatarColour = getGuildAvatarColor(guild.id);

  const href = () => {
    switch (guild.permission_level) {
      case 2:
        return `/manage/${guild.id}`;
      case 1:
        return `/manage/${guild.id}/transcripts`;
      default:
        return "#";
    }
  };

  const permissionLabel = getGuildPermissionLevelLabel(
    guild.permission_level,
    guild.permission_source,
  );
  const permissionDescription = getGuildPermissionLevelDescription(guild.permission_level);

  const handleClick = () => {
    if (disabled) {
      setAccessModalOpen(true);
      return;
    }
    selectGuild(guild);
  };

  const card = (
    <article
      className={
        "h-full " +
        (guild.premium && !disabled ? "drop-shadow-[0_0_4px_rgba(236,72,153,0.6)] rounded-lg" : "")
      }
    >
      <div
        className={
          "flex items-center space-x-4 bg-gray-800 p-4 rounded-lg h-full w-full " +
          (disabled
            ? "opacity-75 cursor-pointer hover:bg-gray-700/80 transition"
            : "hover:bg-gray-700 transition")
        }
      >
        <div className="w-12 h-12 rounded-md overflow-hidden shrink-0">
          {guild.icon && !iconFailed ? (
            <img
              src={guildIconUrl(guild.id, guild.icon)}
              alt={`${guild.name} server icon`}
              className="w-full h-full object-cover"
              onError={() => setIconFailed(true)}
            />
          ) : (
            <div
              className="w-full h-full flex items-center justify-center text-white text-sm font-medium"
              style={{ backgroundColor: avatarColour }}
              role="img"
              aria-label={`${guild.name} server icon`}
            >
              {getGuildInitials(guild.name)}
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-medium truncate">{guild.name}</h3>
          {disabled ? (
            <div className="flex items-center text-gray-400 text-sm mt-1">
              <FontAwesomeIcon icon="lock" className="w-4 h-4 mr-1" aria-hidden="true" />
              <span>No permission</span>
            </div>
          ) : (
            <div className="text-gray-400 text-sm mt-1">{permissionLabel}</div>
          )}
          <div id={`server-${guild.id}-description`} className="sr-only">
            {permissionDescription}
          </div>
        </div>
      </div>
    </article>
  );

  const wrapperClassName =
    "h-full focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-900 rounded-lg block w-full text-left";

  const ariaLabel = disabled
    ? `${guild.name} server - ${permissionDescription}. Click to learn how to get access.`
    : `${guild.name} server - ${permissionDescription}`;

  if (disabled) {
    return (
      <>
        <button
          type="button"
          onClick={handleClick}
          className={wrapperClassName}
          aria-label={ariaLabel}
          aria-describedby={`server-${guild.id}-description`}
        >
          {card}
        </button>
        <DashboardAccessRequiredModal
          isOpen={accessModalOpen}
          onClose={() => setAccessModalOpen(false)}
        />
      </>
    );
  }

  return (
    <Link
      to={href()}
      onClick={handleClick}
      className={wrapperClassName}
      aria-label={ariaLabel}
      aria-describedby={`server-${guild.id}-description`}
    >
      {card}
    </Link>
  );
};

export default Server;
