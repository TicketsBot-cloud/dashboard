import { useEffect, useRef } from "react";
import { apiClient } from "@/lib/api";
import { useNotificationStore } from "@/stores/notifications";
import { useAuthStore } from "@/stores/auth";

const POLL_INTERVAL_MS = 30_000;

/**
 * Polls the unread notification count every 30 seconds and updates the
 * notification store. Only runs while the user is authenticated.
 * Clean up happens automatically on unmount.
 */
export function useNotificationPolling() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const setUnreadCount = useNotificationStore((s) => s.setUnreadCount);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;

    const fetchCount = () => {
      apiClient.notifications
        .unreadCount()
        .then((res) => {
          setUnreadCount(res.data.count);
        })
        .catch(() => {
          // Silently ignore polling errors - the interceptor handles toasts
          // for genuine failures, but we do not want to spam the user during
          // transient network blips.
        });
    };

    // Fetch immediately, then poll
    fetchCount();
    intervalRef.current = setInterval(fetchCount, POLL_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isAuthenticated, setUnreadCount]);
}
