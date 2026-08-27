import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";
import type { KBArticle, KBCategory, KBCustomisation } from "@/types";

// Query keys
const kbKeys = {
  all: ["kb"] as const,
  articles: (guildId: string) => [...kbKeys.all, "articles", guildId] as const,
  article: (guildId: string, articleId: number) =>
    [...kbKeys.all, "article", guildId, articleId] as const,
  categories: (guildId: string) => [...kbKeys.all, "categories", guildId] as const,
  settings: (guildId: string) => [...kbKeys.all, "settings", guildId] as const,
};

export const useKBArticles = (guildId: string | undefined) => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  return useQuery<KBArticle[]>({
    queryKey: kbKeys.articles(guildId || ""),
    queryFn: () => apiClient.kb.listArticles(guildId!).then((res) => res.data),
    enabled: isAuthenticated && !!guildId,
    staleTime: 30_000,
  });
};

export const useKBArticle = (guildId: string | undefined, articleId: number | undefined) => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  return useQuery<KBArticle>({
    queryKey: kbKeys.article(guildId || "", articleId || 0),
    queryFn: () => apiClient.kb.getArticle(guildId!, articleId!).then((res) => res.data),
    enabled: isAuthenticated && !!guildId && !!articleId,
    staleTime: 30_000,
  });
};

export const useKBCategories = (guildId: string | undefined) => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  return useQuery<KBCategory[]>({
    queryKey: kbKeys.categories(guildId || ""),
    queryFn: () => apiClient.kb.listCategories(guildId!).then((res) => res.data),
    enabled: isAuthenticated && !!guildId,
    staleTime: 30_000,
  });
};

export const useCreateKBArticle = (guildId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Partial<KBArticle>) => apiClient.kb.createArticle(guildId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: kbKeys.articles(guildId) });
    },
  });
};

export const useUpdateKBArticle = (guildId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ articleId, data }: { articleId: number; data: Partial<KBArticle> }) =>
      apiClient.kb.updateArticle(guildId, articleId, data),
    onSuccess: (_res, variables) => {
      queryClient.invalidateQueries({ queryKey: kbKeys.articles(guildId) });
      queryClient.invalidateQueries({
        queryKey: kbKeys.article(guildId, variables.articleId),
      });
    },
  });
};

export const useReorderKBArticles = (guildId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (articleIds: number[]) => apiClient.kb.reorderArticles(guildId, articleIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: kbKeys.articles(guildId) });
    },
  });
};

export const useDeleteKBArticle = (guildId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (articleId: number) => apiClient.kb.deleteArticle(guildId, articleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: kbKeys.articles(guildId) });
    },
  });
};

export const useCreateKBCategory = (guildId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Partial<KBCategory>) => apiClient.kb.createCategory(guildId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: kbKeys.categories(guildId) });
    },
  });
};

export const useUpdateKBCategory = (guildId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ catId, data }: { catId: number; data: Partial<KBCategory> }) =>
      apiClient.kb.updateCategory(guildId, catId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: kbKeys.categories(guildId) });
    },
  });
};

export const useKBSettings = (guildId: string | undefined) => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  return useQuery<KBCustomisation>({
    queryKey: kbKeys.settings(guildId || ""),
    queryFn: () => apiClient.kb.getSettings(guildId!).then((res) => res.data),
    enabled: isAuthenticated && !!guildId,
    staleTime: 30_000,
  });
};

export const useUpdateKBSettings = (guildId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Partial<KBCustomisation>) => apiClient.kb.updateSettings(guildId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: kbKeys.settings(guildId) });
    },
  });
};

export const useDeleteKBCategory = (guildId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (catId: number) => apiClient.kb.deleteCategory(guildId, catId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: kbKeys.categories(guildId) });
    },
  });
};
