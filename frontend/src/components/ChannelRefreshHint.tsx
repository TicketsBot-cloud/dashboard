import type { FC } from "react";
import { useChannelRefresh } from "@/hooks/useChannelRefresh";
import { useGuildStore } from "@/stores/guild";
import type { GuildChannel } from "@/types";

interface ChannelRefreshHintProps {
  /** Defaults to the selected guild. */
  guildId?: string;
  onRefreshed?: (channels: GuildChannel[]) => void;
  noun?: "channels" | "categories";
}

const ChannelRefreshHint: FC<ChannelRefreshHintProps> = ({
  guildId,
  onRefreshed,
  noun = "channels",
}) => {
  const selectedGuildId = useGuildStore((s) => s.selectedGuild?.id);
  const { refresh, refreshing, secondsLeft } = useChannelRefresh(
    guildId ?? selectedGuildId?.toString(),
    onRefreshed,
  );

  const unavailable = refreshing || secondsLeft > 0;

  let action = "Click here to refresh";
  if (refreshing) {
    action = "Refreshing…";
  } else if (secondsLeft > 0) {
    action = `Refresh available in ${secondsLeft}s`;
  }

  return (
    <p className="mt-1 text-xs text-gray-400">
      Missing {noun}?{" "}
      {/* aria-disabled rather than disabled, so keyboard focus is not dropped mid-refresh */}
      <button
        type="button"
        aria-disabled={unavailable}
        className={
          unavailable
            ? "cursor-not-allowed text-gray-500"
            : "text-blue-400 underline hover:text-blue-300"
        }
        onClick={() => void refresh()}
      >
        {action}
      </button>
    </p>
  );
};

export default ChannelRefreshHint;
