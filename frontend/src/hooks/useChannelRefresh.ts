import { useCallback } from "react";
import { isAxiosError } from "axios";
import { toast } from "sonner";
import { apiClient } from "@/lib/api";
import { useChannelRefreshStore } from "@/stores/channelRefresh";
import { useGuildStore } from "@/stores/guild";
import type { GuildChannel } from "@/types";

const DEFAULT_COOLDOWN_SECONDS = 60;

/**
 * Re-fetches a guild's channels from Discord. Without `onRefreshed` the result is written to
 * the guild store; pass it when the caller holds channels for a guild other than the selected one.
 */
export function useChannelRefresh(
  guildId: string | undefined,
  onRefreshed?: (channels: GuildChannel[]) => void,
) {
  const secondsLeft = useChannelRefreshStore((s) => (guildId ? (s.remaining[guildId] ?? 0) : 0));
  const refreshing = useChannelRefreshStore((s) => (guildId ? !!s.inFlight[guildId] : false));
  const updateGuild = useGuildStore((s) => s.updateGuild);

  const refresh = useCallback(async () => {
    if (!guildId) return;

    const { inFlight, remaining, setInFlight, startCooldown } = useChannelRefreshStore.getState();
    if (inFlight[guildId] || (remaining[guildId] ?? 0) > 0) return;

    setInFlight(guildId, true);
    try {
      const res = await apiClient.guilds.refreshChannels(guildId);
      if (onRefreshed) {
        onRefreshed(res.data);
      } else {
        updateGuild(guildId, { channels: res.data });
      }
      startCooldown(guildId, DEFAULT_COOLDOWN_SECONDS);
      toast.success("Channel list refreshed.");
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === 429) {
        const retryAfter = Number(error.response.data?.retry_after) || DEFAULT_COOLDOWN_SECONDS;
        startCooldown(guildId, retryAfter);
        toast.warning(
          `Channels were refreshed recently. You can refresh again in ${retryAfter} seconds.`,
        );
      } else {
        toast.error("Could not refresh the channel list. Please try again.");
      }
    } finally {
      setInFlight(guildId, false);
    }
  }, [guildId, onRefreshed, updateGuild]);

  return { refresh, refreshing, secondsLeft };
}
