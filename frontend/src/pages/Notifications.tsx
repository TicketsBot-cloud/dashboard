/**
 * Notifications Page
 *
 * Displays in-app notifications grouped by timeframe with category filtering,
 * mark-as-read, and mark-all-as-read functionality.
 */

import { useState, useEffect, useCallback } from "react";
import type { SyntheticEvent } from "react";
import { MainLayout } from "@/pages/layout/Main";
import { useNavigate } from "react-router";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBellSlash, faCheck, faCheckDouble } from "@fortawesome/free-solid-svg-icons";
import Button from "@/components/Button";
import DiscordContent from "@/components/discord/DiscordContent";
import Pagination from "@/components/Pagination";
import Tabs from "@/components/Tabs";
import { useAuthStore } from "@/stores/auth";
import { useNotificationStore } from "@/stores/notifications";
import { isAnyAdmin } from "@/lib/admin-tier";
import { categoryColour, categoryIcon, categoryLabel } from "@/lib/notification-category";
import { apiClient } from "@/lib/api";
import Skeleton from "react-loading-skeleton";
import type { Notification } from "@/types";

// ─── Types ──────────────────────────────────────────────────────────────────────

type FilterTab = "all" | "affiliate" | "integrations" | "admin";

const NOTIFICATIONS_PER_PAGE = 25;

// ─── Helpers ────────────────────────────────────────────────────────────────────

function formatRelativeTime(iso: string): string {
  const now = new Date();
  const date = new Date(iso);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;

  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

function groupByTimeframe(
  notifications: Notification[],
): { label: string; items: Notification[] }[] {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday.getTime() - 86_400_000);
  const startOfWeek = new Date(startOfToday.getTime() - startOfToday.getDay() * 86_400_000);

  const groups: { label: string; items: Notification[] }[] = [
    { label: "Today", items: [] },
    { label: "Yesterday", items: [] },
    { label: "This Week", items: [] },
    { label: "Earlier", items: [] },
  ];

  for (const notification of notifications) {
    const date = new Date(notification.created_at);
    if (date >= startOfToday) {
      groups[0].items.push(notification);
    } else if (date >= startOfYesterday) {
      groups[1].items.push(notification);
    } else if (date >= startOfWeek) {
      groups[2].items.push(notification);
    } else {
      groups[3].items.push(notification);
    }
  }

  return groups.filter((g) => g.items.length > 0);
}

// ─── Skeleton ───────────────────────────────────────────────────────────────────

function NotificationsSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading notifications">
      {/* Filter tabs skeleton */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <Skeleton width={60} height={36} borderRadius={8} />
          <Skeleton width={80} height={36} borderRadius={8} />
          <Skeleton width={70} height={36} borderRadius={8} />
        </div>
        <Skeleton width={120} height={36} borderRadius={8} />
      </div>

      {/* Notification group skeletons */}
      {Array.from({ length: 2 }).map((_, groupIdx) => (
        <div key={groupIdx}>
          <Skeleton width={100} height={16} className="mb-3" />
          <div className="space-y-2">
            {Array.from({ length: groupIdx === 0 ? 3 : 2 }).map((_, i) => (
              <div key={i} className="bg-gray-800 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <Skeleton width={16} height={16} className="mt-1 shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <Skeleton width={70} height={20} borderRadius={4} />
                      <Skeleton width="50%" height={18} />
                    </div>
                    <Skeleton width="80%" height={14} />
                  </div>
                  <Skeleton width={50} height={14} />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Component ──────────────────────────────────────────────────────────────────

export default function Notifications() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const isAdmin = isAnyAdmin(user?.admin_tier ?? "");
  const { decrementUnread, clearUnread } = useNotificationStore();

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [notificationTotal, setNotificationTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<FilterTab>("all");

  const loadNotifications = useCallback(async () => {
    try {
      const categoryParam = activeTab === "all" ? undefined : activeTab;
      const res = await apiClient.notifications.list(categoryParam, page, NOTIFICATIONS_PER_PAGE);
      setNotifications(res.data.notifications);
      setNotificationTotal(res.data.total ?? 0);
    } catch {
      // Interceptor handles error display
    } finally {
      setLoading(false);
    }
  }, [activeTab, page]);

  useEffect(() => {
    setLoading(true);
    loadNotifications();
  }, [loadNotifications]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleMarkAllRead = async () => {
    try {
      await apiClient.notifications.markAllAsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      clearUnread();
    } catch {
      // Interceptor handles error display
    }
  };

  const handleMarkRead = async (id: number) => {
    try {
      await apiClient.notifications.markAsRead(id);
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
      decrementUnread();
    } catch {
      // Interceptor handles error display
    }
  };

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.read) {
      handleMarkRead(notification.id);
    }
    if (notification.link) {
      navigate(notification.link);
    }
  };

  const grouped = groupByTimeframe(notifications);
  const notificationTotalPages = Math.max(1, Math.ceil(notificationTotal / NOTIFICATIONS_PER_PAGE));
  const handleTabChange = (key: string) => {
    setActiveTab(key as FilterTab);
    setPage(1);
  };

  const tabDefinitions: { key: FilterTab; label: string; adminOnly?: boolean }[] = [
    { key: "all", label: "All" },
    { key: "affiliate", label: "Affiliate" },
    { key: "integrations", label: "Integrations" },
    { key: "admin", label: "Admin", adminOnly: true },
  ];

  const visibleTabs = tabDefinitions
    .filter((t) => !t.adminOnly || isAdmin)
    .map((t) => ({ key: t.key, label: t.label }));

  if (loading) {
    return (
      <MainLayout title="Notifications" subtitle="Stay up to date with your account activity">
        <NotificationsSkeleton />
      </MainLayout>
    );
  }

  return (
    <MainLayout title="Notifications" subtitle="Stay up to date with your account activity">
      <div className="space-y-6">
        {/* Header bar: filter tabs + mark all read */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          {/* Filter tabs */}
          <Tabs
            tabs={visibleTabs}
            activeTab={activeTab}
            onChange={handleTabChange}
            ariaLabel="Notification filters"
          />

          {/* Mark all read */}
          {unreadCount > 0 && (
            <Button
              variant="secondary"
              size="sm"
              onClick={handleMarkAllRead}
              className="whitespace-nowrap"
            >
              <FontAwesomeIcon icon={faCheckDouble} className="mr-1.5" aria-hidden="true" />
              Mark all as read
            </Button>
          )}
        </div>

        {/* Notification list */}
        <div
          role="tabpanel"
          id={`tabpanel-${activeTab}`}
          aria-labelledby={`tab-${activeTab}`}
          tabIndex={0}
        >
          {notifications.length === 0 ? (
            <EmptyState activeTab={activeTab} />
          ) : (
            <div className="space-y-6">
              {grouped.map((group) => (
                <div key={group.label}>
                  <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                    {group.label}
                  </h2>
                  <div className="space-y-2">
                    {group.items.map((notification) => (
                      <NotificationCard
                        key={notification.id}
                        notification={notification}
                        onClick={() => handleNotificationClick(notification)}
                        onMarkRead={() => handleMarkRead(notification.id)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <Pagination
          variant="full"
          page={page}
          totalPages={notificationTotalPages}
          onChange={setPage}
          disabled={loading}
        />
      </div>
    </MainLayout>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────────

function NotificationCard({
  notification,
  onClick,
  onMarkRead,
}: {
  notification: Notification;
  onClick: () => void;
  onMarkRead: () => void;
}) {
  // The body renders markdown, which can produce its own links and spoilers. Those
  // handle their own activation, so the card must not navigate on top of them.
  // closest() walks up to the card itself (also role="button") — comparing against
  // currentTarget is what limits the bail-out to genuine descendants.
  const isInteractiveTarget = (event: SyntheticEvent<HTMLDivElement>) => {
    const interactive = (event.target as HTMLElement | null)?.closest("a, [role='button']");
    return !!interactive && interactive !== event.currentTarget;
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={(e) => {
        if (isInteractiveTarget(e)) return;
        onClick();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          if (isInteractiveTarget(e)) return;
          e.preventDefault();
          onClick();
        }
      }}
      className={`group relative bg-gray-800 rounded-xl p-4 transition-colors cursor-pointer hover:bg-gray-750 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset ${
        !notification.read ? "border-l-3 border-l-blue-500" : "border-l-3 border-l-transparent"
      }`}
      aria-label={`${notification.read ? "" : "Unread: "}${notification.title}`}
    >
      <div className="flex items-start gap-3">
        {/* Category icon */}
        <div className="mt-0.5 shrink-0">
          <FontAwesomeIcon
            icon={categoryIcon(notification.category)}
            className={`text-sm ${!notification.read ? "text-blue-400" : "text-gray-500"}`}
            aria-hidden="true"
          />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            {/* Category badge */}
            <span
              className={`inline-block text-white text-xs px-2 py-0.5 rounded ${categoryColour(
                notification.category,
              )}`}
            >
              {categoryLabel(notification.category)}
            </span>

            {/* Title */}
            <h3
              className={`text-sm font-medium truncate ${
                !notification.read ? "text-white" : "text-gray-300"
              }`}
            >
              {notification.title}
            </h3>
          </div>

          {/* Body */}
          <DiscordContent content={notification.body} className="text-sm text-gray-300" />
        </div>

        {/* Right side: timestamp, unread dot, and mark-read button */}
        <div className="flex flex-col items-end gap-1 shrink-0 ml-2">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-500 whitespace-nowrap">
              {formatRelativeTime(notification.created_at)}
            </span>
            {!notification.read && (
              <div
                className="w-2 h-2 bg-blue-500 rounded-full shrink-0 sm:hidden"
                aria-hidden="true"
              />
            )}
          </div>
          {!notification.read && (
            <Button
              variant="ghost"
              size="icon"
              onClick={(event) => {
                event.stopPropagation();
                onMarkRead();
              }}
              className="hidden sm:inline-flex opacity-40 group-hover:opacity-100 transition-opacity text-xs text-gray-400 hover:text-blue-400 focus:opacity-100"
              title="Mark as read"
            >
              <FontAwesomeIcon icon={faCheck} aria-hidden="true" />
              <span className="sr-only">Mark &ldquo;{notification.title}&rdquo; as read</span>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyState({ activeTab }: { activeTab: FilterTab }) {
  const messages: Record<FilterTab, { title: string; body: string }> = {
    all: {
      title: "No notifications yet",
      body: "When something important happens, you will see it here.",
    },
    affiliate: {
      title: "No affiliate notifications",
      body: "Referral activity and credit updates will appear here.",
    },
    integrations: {
      title: "No integration notifications",
      body: "Updates on your public integration requests will appear here.",
    },
    admin: {
      title: "No admin notifications",
      body: "Staff review requests you can action will appear here.",
    },
  };

  const { title, body } = messages[activeTab];

  return (
    <div className="text-center py-16" role="status">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-800 mb-4">
        <FontAwesomeIcon icon={faBellSlash} className="text-2xl text-gray-500" aria-hidden="true" />
      </div>
      <h2 className="text-lg font-semibold text-white mb-2">{title}</h2>
      <p className="text-gray-300 text-sm max-w-md mx-auto">{body}</p>
    </div>
  );
}
