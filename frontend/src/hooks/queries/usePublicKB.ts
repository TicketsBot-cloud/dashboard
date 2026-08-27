import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import type { KBGuildInfo, KBArticle, KBCategory } from "@/types";

// Query keys
const publicKBKeys = {
  all: ["publicKB"] as const,
  info: (guildId: string) => [...publicKBKeys.all, "info", guildId] as const,
  articles: (guildId: string) => [...publicKBKeys.all, "articles", guildId] as const,
  article: (guildId: string, slug: string) =>
    [...publicKBKeys.all, "article", guildId, slug] as const,
  categories: (guildId: string) => [...publicKBKeys.all, "categories", guildId] as const,
  search: (guildId: string, query: string) =>
    [...publicKBKeys.all, "search", guildId, query] as const,
};

export const usePublicKBInfo = (guildId: string | undefined) => {
  return useQuery<KBGuildInfo>({
    queryKey: publicKBKeys.info(guildId || ""),
    queryFn: () => apiClient.kbPublic.getInfo(guildId!).then((res) => res.data),
    enabled: !!guildId,
    staleTime: 60_000,
  });
};

export const usePublicKBArticles = (guildId: string | undefined) => {
  return useQuery<KBArticle[]>({
    queryKey: publicKBKeys.articles(guildId || ""),
    queryFn: () => apiClient.kbPublic.listArticles(guildId!).then((res) => res.data),
    enabled: !!guildId,
    staleTime: 30_000,
  });
};

export const usePublicKBArticle = (guildId: string | undefined, slug: string | undefined) => {
  return useQuery<KBArticle>({
    queryKey: publicKBKeys.article(guildId || "", slug || ""),
    queryFn: () => apiClient.kbPublic.getArticle(guildId!, slug!).then((res) => res.data),
    enabled: !!guildId && !!slug,
    staleTime: 30_000,
  });
};

export const usePublicKBCategories = (guildId: string | undefined) => {
  return useQuery<KBCategory[]>({
    queryKey: publicKBKeys.categories(guildId || ""),
    queryFn: () => apiClient.kbPublic.listCategories(guildId!).then((res) => res.data),
    enabled: !!guildId,
    staleTime: 30_000,
  });
};

export const usePublicKBSearch = (guildId: string | undefined, query: string) => {
  return useQuery<KBArticle[]>({
    queryKey: publicKBKeys.search(guildId || "", query),
    queryFn: () => apiClient.kbPublic.search(guildId!, query).then((res) => res.data),
    enabled: !!guildId && query.length > 0,
    staleTime: 15_000,
  });
};

export const useSubmitKBFeedback = (guildId: string | undefined) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ slug, helpful }: { slug: string; helpful: boolean }) =>
      apiClient.kbPublic.submitFeedback(guildId!, slug, helpful),
    onSuccess: (_res, variables) => {
      queryClient.invalidateQueries({
        queryKey: publicKBKeys.article(guildId || "", variables.slug),
      });
    },
  });
};
