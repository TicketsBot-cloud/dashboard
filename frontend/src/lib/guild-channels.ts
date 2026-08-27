import type { GuildChannel } from "@/types";

export const sortGuildChannels = (channels: GuildChannel[]) => {
  // If no channels are loaded yet, show loading option
  if (channels.length === 0) {
    return [{ key: "", label: "Loading channels...", disabled: true }];
  }

  const sorted = channels
    .slice()
    .sort((a: GuildChannel, b: GuildChannel) => a.position - b.position);
  const toOption = (channel: GuildChannel) => ({
    key: String(channel.id),
    label: `${channel.type == 2 ? "🔈" : "#"} ${channel.name}`,
    disabled: channel.type !== 0,
  });

  return sorted.reduce(
    (acc: Array<{ key: string; label: string; disabled: boolean }>, channel: GuildChannel) => {
      if (channel.type === 4) {
        acc.push({
          key: String(channel.id),
          label: `↓ ${channel.name}`,
          disabled: true,
        });
        sorted
          .filter((child: GuildChannel) => String(child.parent_id) === String(channel.id))
          .forEach((child: GuildChannel) => {
            acc.push(toOption(child));
          });
      } else if (!channel.parent_id) {
        acc.push(toOption(channel));
      }
      return acc;
    },
    [] as Array<{ key: string; label: string; disabled: boolean }>,
  );
};
