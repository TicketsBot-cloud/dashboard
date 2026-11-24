import { useState, type FC, type ReactNode } from "react";

import { Link } from "react-router";
import { guildIconUrl } from "@/lib/discord-cdn";
import { getGuildAvatarColor, getGuildInitials } from "@/lib/guild-avatar";
import { getGuildPickerTier, getGuildPickerTierLabel } from "@/lib/guild-picker";
import { getGuildPermissionLevelDescription } from "@/lib/guild-permission";
import { useGuildStore } from "@/stores/guild";
import DashboardAccessRequiredModal from "@/components/modals/DashboardAccessRequiredModal";
import { HoverTooltip } from "@/components/HoverTooltip";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { Guild } from "@/types";

interface ServerIconTileProps {
  guild: Guild;
}

function guildManageHref(guild: Guild): string {
  switch (guild.permission_level) {
    case 2:
      return `/manage/${guild.id}`;
    case 1:
      return `/manage/${guild.id}/transcripts`;
    default:
      return "#";
  }
}

const ServerIconTile: FC<ServerIconTileProps> = ({ guild }) => {
  const { selectGuild } = useGuildStore();
  const disabled = guild.permission_level === 0;
  const tier = getGuildPickerTier(guild);
  const tierLabel = getGuildPickerTierLabel(tier);
  const [iconFailed, setIconFailed] = useState(false);
  const [accessModalOpen, setAccessModalOpen] = useState(false);

  const avatarColour = getGuildAvatarColor(guild.id);
  const permissionDescription = getGuildPermissionLevelDescription(guild.permission_level);

  const handleClick = () => {
    if (disabled) {
      setAccessModalOpen(true);
      return;
    }
    selectGuild(guild);
  };

  const iconRingClass =
    tier === 0
      ? "ring-2 ring-pink-500/90 ring-offset-2 ring-offset-gray-900"
      : disabled
        ? "ring-2 ring-gray-600 ring-offset-2 ring-offset-gray-900 opacity-60 grayscale"
        : "ring-2 ring-transparent ring-offset-2 ring-offset-gray-900 hover:ring-gray-600";

  const iconContent = (
    <div className="relative">
      <div
        className={
          "w-16 h-16 rounded-xl overflow-hidden shrink-0 transition-shadow " + iconRingClass
        }
      >
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
            style={{ backgroundColor: avatarColour }}
            role="img"
            aria-hidden="true"
          >
            {getGuildInitials(guild.name)}
          </div>
        )}
      </div>
      {disabled && (
        <span
          className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border border-gray-600 bg-gray-800 text-gray-300 shadow-sm"
          aria-hidden="true"
        >
          <FontAwesomeIcon icon="lock" className="h-2.5 w-2.5" />
        </span>
      )}
    </div>
  );

  const wrapperClassName =
    "rounded-xl block p-1 transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-900";

  const ariaLabel = disabled
    ? `${guild.name} — ${tierLabel}. ${permissionDescription}. Click to learn how to get access.`
    : `${guild.name} — ${tierLabel}. ${permissionDescription}`;

  const tooltipLabel = `${guild.name} (${tierLabel})`;

  const wrappedTile = (child: ReactNode) => (
    <HoverTooltip label={tooltipLabel} className="relative inline-flex">
      {child}
    </HoverTooltip>
  );

  if (disabled) {
    return (
      <>
        {wrappedTile(
          <button
            type="button"
            onClick={handleClick}
            className={wrapperClassName}
            aria-label={ariaLabel}
            title={tooltipLabel}
          >
            {iconContent}
          </button>,
        )}
        <DashboardAccessRequiredModal
          isOpen={accessModalOpen}
          onClose={() => setAccessModalOpen(false)}
        />
      </>
    );
  }

  return wrappedTile(
    <Link
      to={guildManageHref(guild)}
      onClick={handleClick}
      className={wrapperClassName}
      aria-label={ariaLabel}
      title={tooltipLabel}
    >
      {iconContent}
    </Link>,
  );
};

export default ServerIconTile;
