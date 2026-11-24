import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { guildIconUrl, userAvatarUrl } from "@/lib/discord-cdn";
import { getGuildAvatarColor, getGuildInitials } from "@/lib/guild-avatar";

interface BlacklistAvatarProps {
  targetType: "user" | "guild";
  targetId: string;
  label: string;
  name?: string;
  avatarUrl?: string;
  icon?: string;
}

export default function BlacklistAvatar({
  targetType,
  targetId,
  label,
  name,
  avatarUrl,
  icon,
}: BlacklistAvatarProps) {
  const [imageFailed, setImageFailed] = useState(false);

  if (targetType === "user") {
    return (
      <img
        src={userAvatarUrl(targetId, imageFailed ? null : (avatarUrl ?? null))}
        alt={`${label} avatar`}
        className="w-full h-full object-cover"
        onError={() => setImageFailed(true)}
      />
    );
  }

  if (icon && !imageFailed) {
    return (
      <img
        src={guildIconUrl(targetId, icon)}
        alt={`${label} server icon`}
        className="w-full h-full object-cover"
        onError={() => setImageFailed(true)}
      />
    );
  }

  return (
    <div
      className="w-full h-full flex items-center justify-center text-white text-sm font-medium bg-gray-600"
      style={name ? { backgroundColor: getGuildAvatarColor(targetId) } : undefined}
      role="img"
      aria-label={`${label} server icon`}
    >
      {name ? (
        getGuildInitials(name)
      ) : (
        <FontAwesomeIcon icon="server" className="text-gray-300 text-xl" aria-hidden="true" />
      )}
    </div>
  );
}
