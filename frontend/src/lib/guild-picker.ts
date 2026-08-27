import type { Guild } from "@/types";

/** 0 = premium manageable, 1 = free manageable, 2 = no permission */
export type GuildPickerTier = 0 | 1 | 2;

export function getGuildPickerTier(guild: Guild): GuildPickerTier {
  if (!guild.permission_level || guild.permission_level === 0) return 2;
  if (guild.premium) return 0;
  return 1;
}

export function getGuildPickerTierLabel(tier: GuildPickerTier): string {
  switch (tier) {
    case 0:
      return "Premium";
    case 1:
      return "Free";
    case 2:
      return "No access";
  }
}

export function sortGuildsForPicker(guilds: Guild[]): Guild[] {
  return [...guilds].sort((a, b) => {
    const tierDiff = getGuildPickerTier(a) - getGuildPickerTier(b);
    if (tierDiff !== 0) return tierDiff;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
}
