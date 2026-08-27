import type { Guild, GuildSettings } from "@/types";
import { create } from "zustand";
import { devtools } from "zustand/middleware";

interface GuildState {
  // State
  guilds: Guild[];
  selectedGuild: Guild | null;
  guildSettings: GuildSettings | null;
  isLoadingGuilds: boolean;
  isLoadingSettings: boolean;

  // Actions
  setGuilds: (guilds: Guild[]) => void;
  selectGuild: (guild: Guild | null) => void;
  updateGuild: (guildId: string, updates: Partial<Guild>) => void;
  setGuildSettings: (settings: GuildSettings | null) => void;
  updateGuildSettings: (updates: Partial<GuildSettings>) => void;
  setLoadingGuilds: (loading: boolean) => void;
  setLoadingSettings: (loading: boolean) => void;
  clearGuildData: () => void;
}

export const useGuildStore = create<GuildState>()(
  devtools(
    (set, get) => ({
      // Initial state
      guilds: [],
      selectedGuild: null,
      guildSettings: null,
      isLoadingGuilds: false,
      isLoadingSettings: false,

      // Actions
      setGuilds: (guilds: Guild[]) => {
        set({ guilds }, false, "guild/setGuilds");
      },

      selectGuild: (guild: Guild | null) => {
        set(
          {
            selectedGuild: guild,
            guildSettings: null, // Clear settings when switching guilds
          },
          false,
          "guild/selectGuild",
        );
      },

      updateGuild: (guildId: string, updates: Partial<Guild>) => {
        const { guilds, selectedGuild } = get();

        // Update in guilds array
        const updatedGuilds = guilds.map((guild) =>
          guild.id.toString() === guildId ? { ...guild, ...updates } : guild,
        );

        // Update selected guild if it matches
        const updatedSelectedGuild =
          selectedGuild && selectedGuild.id.toString() === guildId
            ? { ...selectedGuild, ...updates }
            : selectedGuild;

        set(
          {
            guilds: updatedGuilds,
            selectedGuild: updatedSelectedGuild,
          },
          false,
          "guild/updateGuild",
        );
      },

      setGuildSettings: (settings: GuildSettings | null) => {
        set({ guildSettings: settings }, false, "guild/setGuildSettings");
      },

      updateGuildSettings: (updates: Partial<GuildSettings>) => {
        const currentSettings = get().guildSettings;
        if (currentSettings) {
          const updatedSettings = { ...currentSettings, ...updates };
          set({ guildSettings: updatedSettings }, false, "guild/updateGuildSettings");
        }
      },

      setLoadingGuilds: (loading: boolean) => {
        set({ isLoadingGuilds: loading }, false, "guild/setLoadingGuilds");
      },

      setLoadingSettings: (loading: boolean) => {
        set({ isLoadingSettings: loading }, false, "guild/setLoadingSettings");
      },

      clearGuildData: () => {
        set(
          {
            guilds: [],
            selectedGuild: null,
            guildSettings: null,
            isLoadingGuilds: false,
            isLoadingSettings: false,
          },
          false,
          "guild/clearGuildData",
        );
      },
    }),
    {
      name: "guild-store",
      enabled: import.meta.env.DEV,
    },
  ),
);
