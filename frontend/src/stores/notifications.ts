import { create } from "zustand";
import { devtools } from "zustand/middleware";

interface NotificationState {
  unreadCount: number;
  setUnreadCount: (count: number) => void;
  decrementUnread: () => void;
  clearUnread: () => void;
}

export const useNotificationStore = create<NotificationState>()(
  devtools(
    (set) => ({
      unreadCount: 0,

      setUnreadCount: (count: number) => {
        set({ unreadCount: count }, false, "notifications/setUnreadCount");
      },

      decrementUnread: () => {
        set(
          (state) => ({ unreadCount: Math.max(0, state.unreadCount - 1) }),
          false,
          "notifications/decrementUnread",
        );
      },

      clearUnread: () => {
        set({ unreadCount: 0 }, false, "notifications/clearUnread");
      },
    }),
    {
      name: "notification-store",
      enabled: import.meta.env.DEV,
    },
  ),
);
