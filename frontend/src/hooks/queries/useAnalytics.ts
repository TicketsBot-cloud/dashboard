import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";
import type {
  AnalyticsOverview,
  BasicOverview,
  PanelAnalyticsResponse,
  StaffAnalytics,
  StaffDetailAnalytics,
} from "@/types";

// Query keys: `panels` is the canonical string ("" for all, so existing
// unfiltered cache entries stay structurally identical).
const analyticsKeys = {
  all: ["analytics"] as const,
  overview: (guildId: string, days: number, panels: string, caseInsensitive: boolean) =>
    [...analyticsKeys.all, "overview", guildId, days, panels, caseInsensitive] as const,
  staff: (guildId: string, days: number, panels: string) =>
    [...analyticsKeys.all, "staff", guildId, days, panels] as const,
  staffDetail: (guildId: string, userId: string) =>
    [...analyticsKeys.all, "staffDetail", guildId, userId] as const,
  panels: (guildId: string, days: number, panels: string) =>
    [...analyticsKeys.all, "panels", guildId, days, panels] as const,
};

export const useBasicOverview = (guildId: string | undefined) => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  return useQuery<BasicOverview>({
    queryKey: [...analyticsKeys.all, "basicOverview", guildId || ""],
    queryFn: () => apiClient.overview.getBasic(guildId!).then((res) => res.data),
    enabled: isAuthenticated && !!guildId,
    staleTime: 60_000,
  });
};

export const useAnalyticsOverview = (
  guildId: string | undefined,
  days: number = 30,
  panels: string = "",
  caseInsensitive: boolean = false,
) => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  return useQuery<AnalyticsOverview>({
    queryKey: analyticsKeys.overview(guildId || "", days, panels, caseInsensitive),
    queryFn: () =>
      apiClient.analytics
        .getOverview(guildId!, days, panels || undefined, caseInsensitive)
        .then((res) => res.data),
    enabled: isAuthenticated && !!guildId,
    staleTime: 60_000,
    // Keep previous data while a filter change refetches, so the page does not
    // collapse into skeletons on every click.
    placeholderData: keepPreviousData,
    retry: (failureCount, error) => {
      // Do not retry 429s; the rate window is still exhausted and each retry
      // fires an error toast via the axios interceptor.
      if (
        error &&
        typeof error === "object" &&
        "response" in error &&
        (error as { response?: { status?: number } }).response?.status === 429
      ) {
        return false;
      }
      return failureCount < 2;
    },
  });
};

export const useAnalyticsStaffDetail = (
  guildId: string | undefined,
  userId: string | undefined,
) => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  return useQuery<StaffDetailAnalytics>({
    queryKey: analyticsKeys.staffDetail(guildId || "", userId || ""),
    queryFn: () => apiClient.analytics.getStaffDetail(guildId!, userId!).then((res) => res.data),
    enabled: isAuthenticated && !!guildId && !!userId,
    staleTime: 60_000,
  });
};

export const useAnalyticsStaff = (
  guildId: string | undefined,
  days: number = 30,
  panels: string = "",
) => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  return useQuery<StaffAnalytics>({
    queryKey: analyticsKeys.staff(guildId || "", days, panels),
    queryFn: () =>
      apiClient.analytics.getStaff(guildId!, days, panels || undefined).then((res) => res.data),
    enabled: isAuthenticated && !!guildId,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
    retry: (failureCount, error) => {
      if (
        error &&
        typeof error === "object" &&
        "response" in error &&
        (error as { response?: { status?: number } }).response?.status === 429
      ) {
        return false;
      }
      return failureCount < 2;
    },
  });
};

/**
 * Panel comparison data and filter presets. Panel-scoped: narrows to the
 * selected panels filter, same as overview and staff.
 */
export const useAnalyticsPanels = (
  guildId: string | undefined,
  days: number = 30,
  panels: string = "",
) => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  return useQuery<PanelAnalyticsResponse>({
    queryKey: analyticsKeys.panels(guildId || "", days, panels),
    queryFn: () =>
      apiClient.analytics.getPanels(guildId!, days, panels || undefined).then((res) => res.data),
    enabled: isAuthenticated && !!guildId,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
    retry: (failureCount, error) => {
      if (
        error &&
        typeof error === "object" &&
        "response" in error &&
        (error as { response?: { status?: number } }).response?.status === 429
      ) {
        return false;
      }
      return failureCount < 2;
    },
  });
};
