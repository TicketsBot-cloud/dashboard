import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { useDebounce } from "@/hooks/useDebounce";

export interface UseUrlSearchOptions {
  /** URL search param key (default `q`). */
  paramKey?: string;
  /** Debounce delay in ms (default 300). */
  debounceMs?: number;
  /** When false, search is local-only and not written to the URL. */
  syncToUrl?: boolean;
}

/** Debounced search query, optionally synced to a URL search param. */
export function useUrlSearch(paramKeyOrOptions: string | UseUrlSearchOptions = "q") {
  const options =
    typeof paramKeyOrOptions === "string" ? { paramKey: paramKeyOrOptions } : paramKeyOrOptions;
  const paramKey = options.paramKey ?? "q";
  const debounceMs = options.debounceMs ?? 300;
  const syncToUrl = options.syncToUrl ?? true;

  const [searchParams, setSearchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get(paramKey) ?? "");
  const debouncedSearch = useDebounce(searchQuery, debounceMs);
  const urlSearchValue = searchParams.get(paramKey) ?? "";
  const lastWrittenSearch = useRef(urlSearchValue);

  useEffect(() => {
    if (!syncToUrl) return;
    if (urlSearchValue === lastWrittenSearch.current) return;
    lastWrittenSearch.current = urlSearchValue;
    setSearchQuery(urlSearchValue);
  }, [syncToUrl, urlSearchValue]);

  useEffect(() => {
    if (!syncToUrl) return;
    lastWrittenSearch.current = debouncedSearch;
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (debouncedSearch) next.set(paramKey, debouncedSearch);
        else next.delete(paramKey);
        return next;
      },
      { replace: true },
    );
  }, [debouncedSearch, paramKey, setSearchParams, syncToUrl]);

  return {
    searchQuery,
    setSearchQuery,
    debouncedSearch,
    isSearching: debouncedSearch.trim().length > 0,
  };
}
