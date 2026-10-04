import { create } from "zustand";

interface ChannelRefreshState {
  remaining: Record<string, number>;
  inFlight: Record<string, boolean>;
  setInFlight: (guildId: string, inFlight: boolean) => void;
  startCooldown: (guildId: string, seconds: number) => void;
}

const timers = new Map<string, ReturnType<typeof setInterval>>();

// Module-level so every hint on a page shares one countdown per guild.
export const useChannelRefreshStore = create<ChannelRefreshState>()((set, get) => ({
  remaining: {},
  inFlight: {},

  setInFlight: (guildId, inFlight) => {
    set({ inFlight: { ...get().inFlight, [guildId]: inFlight } });
  },

  startCooldown: (guildId, seconds) => {
    const existing = timers.get(guildId);
    if (existing) clearInterval(existing);

    set({ remaining: { ...get().remaining, [guildId]: seconds } });

    const timer = setInterval(() => {
      const left = (get().remaining[guildId] ?? 0) - 1;
      set({ remaining: { ...get().remaining, [guildId]: Math.max(0, left) } });
      if (left <= 0) {
        clearInterval(timer);
        timers.delete(guildId);
      }
    }, 1000);
    timers.set(guildId, timer);
  },
}));
