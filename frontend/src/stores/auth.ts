import { create } from "zustand";
import { persist, createJSONStorage, devtools } from "zustand/middleware";
import { validateGuilds } from "@/lib/storage";
import type { User, Guild } from "@/types";

interface AuthState {
  // State
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  guilds: Guild[];

  // Actions
  login: (user: User, token: string) => void;
  logout: () => void;
  updateUser: (updates: Partial<User>) => void;
  setLoading: (loading: boolean) => void;
  setGuilds: (guilds: Guild[]) => void;
  updateGuildPermission: (guildId: string, level: number) => void;
  patchGuild: (guildId: string, updates: Partial<Guild>) => void;
}

export const useAuthStore = create<AuthState>()(
  devtools(
    persist(
      (set, get) => ({
        // Initial state
        user: null,
        accessToken: null,
        isAuthenticated: false,
        isLoading: true,
        guilds: [],

        // Actions
        login: (user: User, accessToken: string) => {
          set({ user, accessToken, isAuthenticated: true, isLoading: false }, false, "auth/login");
        },

        logout: () => {
          set(
            { user: null, accessToken: null, isAuthenticated: false, isLoading: false, guilds: [] },
            false,
            "auth/logout",
          );
        },

        updateUser: (updates: Partial<User>) => {
          const currentUser = get().user;
          if (currentUser) {
            set({ user: { ...currentUser, ...updates } }, false, "auth/updateUser");
          }
        },

        setLoading: (loading: boolean) => {
          set({ isLoading: loading }, false, "auth/setLoading");
        },

        setGuilds: (guilds: Guild[]) => {
          set({ guilds: validateGuilds(guilds) }, false, "auth/setGuilds");
        },

        updateGuildPermission: (guildId: string, level: number) => {
          const guilds = get().guilds.map((g) =>
            g.id === guildId ? { ...g, permission_level: level } : g,
          );
          set({ guilds }, false, "auth/updateGuildPermission");
        },

        patchGuild: (guildId: string, updates: Partial<Guild>) => {
          const guilds = get().guilds.map((g) =>
            g.id.toString() === guildId ? { ...g, ...updates } : g,
          );
          set({ guilds }, false, "auth/patchGuild");
        },
      }),
      {
        name: "auth-storage",
        storage: createJSONStorage(() => localStorage),
        partialize: (state) => ({
          user: state.user,
          accessToken: state.accessToken,
          isAuthenticated: state.isAuthenticated,
          guilds: state.guilds,
        }),
        onRehydrateStorage: () => (state) => {
          state?.setLoading(false);
        },
      },
    ),
    {
      name: "auth-store",
      enabled: import.meta.env.DEV,
    },
  ),
);

export const getGuildById = (guildId: string): Guild | null =>
  useAuthStore.getState().guilds.find((g) => g.id === guildId) ?? null;
