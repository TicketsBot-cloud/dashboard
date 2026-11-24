import { useContext, useMemo } from "react";
import { GuildContext } from "@/state/context";
import type { DiscordContentProps } from "@/components/discord/types";

export function usePreviewEntities(): DiscordContentProps["entities"] {
  const guild = useContext(GuildContext);
  const channels = guild?.channels;
  const roles = guild?.roles;

  return useMemo(() => {
    if (!channels && !roles) return undefined;
    return {
      users: {},
      channels: Object.fromEntries(
        (channels ?? []).map((channel) => [String(channel.id), channel]),
      ),
      roles: Object.fromEntries((roles ?? []).map((role) => [String(role.id), role])),
    };
  }, [channels, roles]);
}
