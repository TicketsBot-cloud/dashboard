import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";

import type { AuditLogEntry, AuditLogResponse } from "@/types";

export interface AuditLogFilters {
  userId: string;
  actionType: string;
  resourceType: string;
  dateFrom: string;
  dateTo: string;
}

export type AuditLogFetcher = (
  body: Record<string, unknown>,
) => Promise<{ data: AuditLogResponse }>;

export interface AuditLogQuery {
  filters: AuditLogFilters;
  setFilter: (key: keyof AuditLogFilters, value: string) => void;
  entries: AuditLogEntry[];
  page: number;
  totalPages: number;
  totalCount: number;
  loading: boolean;
  initialLoading: boolean;
  goToPage: (target: number) => void;
}

/** `resetKey` reloads from page 1 when the underlying scope changes, e.g. the guild id. */
export function useAuditLogQuery(fetcher: AuditLogFetcher, resetKey?: string): AuditLogQuery {
  const [searchParams, setSearchParams] = useSearchParams();

  const [filters, setFilters] = useState<AuditLogFilters>(() => ({
    userId: searchParams.get("user_id") ?? "",
    actionType: searchParams.get("action") ?? "0",
    resourceType: searchParams.get("resource") ?? "0",
    dateFrom: searchParams.get("from") ?? "",
    dateTo: searchParams.get("to") ?? "",
  }));

  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  // Kept in a ref so an unmemoised fetcher cannot retrigger the debounced reload every render.
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  const { userId, actionType, resourceType, dateFrom, dateTo } = filters;

  const loadPage = useCallback(
    async (targetPage: number): Promise<boolean> => {
      const body: Record<string, unknown> = { page: targetPage };

      const trimmedUserId = userId.trim();
      if (trimmedUserId !== "") {
        body.user_id = trimmedUserId;
      }
      if (actionType !== "0") {
        body.action_type = parseInt(actionType);
      }
      if (resourceType !== "0") {
        body.resource_type = parseInt(resourceType);
      }
      if (dateFrom) {
        body.after = new Date(dateFrom).toISOString();
      }
      if (dateTo) {
        body.before = new Date(dateTo).toISOString();
      }

      try {
        const res = await fetcherRef.current(body);
        setEntries(res.data.entries || []);
        setTotalCount(res.data.total_count);
        setTotalPages(res.data.total_pages);
        return true;
      } catch (error) {
        console.error("Failed to load audit logs:", error);
        return false;
      }
    },
    [userId, actionType, resourceType, dateFrom, dateTo],
  );

  useEffect(() => {
    setLoading(true);
    const handler = setTimeout(async () => {
      if (await loadPage(1)) {
        setPage(1);
      }
      setLoading(false);
      setInitialLoading(false);
    }, 500);
    return () => clearTimeout(handler);
  }, [loadPage, resetKey]);

  useEffect(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        const apply = (key: string, value: string, cleared: string) => {
          if (value === cleared) next.delete(key);
          else next.set(key, value);
        };
        apply("user_id", userId.trim(), "");
        apply("action", actionType, "0");
        apply("resource", resourceType, "0");
        apply("from", dateFrom, "");
        apply("to", dateTo, "");
        return next;
      },
      { replace: true },
    );
  }, [userId, actionType, resourceType, dateFrom, dateTo, setSearchParams]);

  const setFilter = useCallback((key: keyof AuditLogFilters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const goToPage = useCallback(
    async (target: number) => {
      if (loading || target < 1 || target > totalPages || target === page) return;
      setLoading(true);
      if (await loadPage(target)) {
        setPage(target);
      }
      setLoading(false);
    },
    [loading, totalPages, page, loadPage],
  );

  return {
    filters,
    setFilter,
    entries,
    page,
    totalPages,
    totalCount,
    loading,
    initialLoading,
    goToPage,
  };
}
