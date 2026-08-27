import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";
import { useGuildBootstrapReady } from "@/state/guildBootstrapContext";
import type {
  Form,
  GallerySubmission,
  GuildEmoji,
  Panel,
  PremiumState,
  Tag,
  TicketLabel,
} from "@/types";

export const guildKeys = {
  all: ["guild"] as const,
  panels: (guildId: string) => [...guildKeys.all, "panels", guildId] as const,
  panel: (guildId: string, panelId: string) =>
    [...guildKeys.all, "panel", guildId, panelId] as const,
  multiPanels: (guildId: string) => [...guildKeys.all, "multiPanels", guildId] as const,
  premium: (guildId: string, includeVoting: boolean) =>
    [...guildKeys.all, "premium", guildId, includeVoting] as const,
  emojis: (guildId: string) => [...guildKeys.all, "emojis", guildId] as const,
  forms: (guildId: string) => [...guildKeys.all, "forms", guildId] as const,
  tags: (guildId: string) => [...guildKeys.all, "tags", guildId] as const,
  ticketLabels: (guildId: string) => [...guildKeys.all, "ticketLabels", guildId] as const,
  gallerySubmissions: (guildId: string) =>
    [...guildKeys.all, "gallerySubmissions", guildId] as const,
};

const defaultStaleTime = 5 * 60 * 1000;

function useGuildQueryEnabled(guildId: string | undefined, extra = true) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const bootstrapReady = useGuildBootstrapReady();
  return isAuthenticated && !!guildId && bootstrapReady && extra;
}

export function useGuildPanels(guildId: string | undefined, enabled = true) {
  return useQuery<Panel[]>({
    queryKey: guildKeys.panels(guildId || ""),
    queryFn: () => apiClient.panels.getByGuild(guildId!).then((res) => res.data),
    enabled: useGuildQueryEnabled(guildId, enabled),
    staleTime: defaultStaleTime,
  });
}

export function useGuildPanel(
  guildId: string | undefined,
  panelId: string | undefined,
  enabled = true,
) {
  return useQuery<Panel>({
    queryKey: guildKeys.panel(guildId || "", panelId || ""),
    queryFn: () => apiClient.panels.getById(guildId!, panelId!).then((res) => res.data),
    enabled: useGuildQueryEnabled(guildId, enabled && !!panelId),
    staleTime: defaultStaleTime,
  });
}

export function useGuildMultiPanels(guildId: string | undefined, enabled = true) {
  return useQuery<Array<{ id: number; title: string | null }>>({
    queryKey: guildKeys.multiPanels(guildId || ""),
    queryFn: () => apiClient.multiPanels.getByGuild(guildId!).then((res) => res.data.data),
    enabled: useGuildQueryEnabled(guildId, enabled),
    staleTime: defaultStaleTime,
  });
}

export function useGuildPremium(
  guildId: string | undefined,
  includeVoting = false,
  enabled = true,
) {
  return useQuery<PremiumState>({
    queryKey: guildKeys.premium(guildId || "", includeVoting),
    queryFn: () => apiClient.guilds.getPremium(guildId!, includeVoting).then((res) => res.data),
    enabled: useGuildQueryEnabled(guildId, enabled),
    staleTime: defaultStaleTime,
  });
}

/** Defer until explicitly enabled (e.g. panel editor with EmojiPicker). */
export function useGuildEmojis(guildId: string | undefined, enabled = true) {
  return useQuery<GuildEmoji[]>({
    queryKey: guildKeys.emojis(guildId || ""),
    queryFn: () => apiClient.guilds.getEmojis(guildId!).then((res) => res.data),
    enabled: useGuildQueryEnabled(guildId, enabled),
    staleTime: defaultStaleTime,
  });
}

export function useGuildForms(guildId: string | undefined, enabled = true) {
  return useQuery<Form[]>({
    queryKey: guildKeys.forms(guildId || ""),
    queryFn: () => apiClient.forms.getByGuild(guildId!).then((res) => res.data),
    enabled: useGuildQueryEnabled(guildId, enabled),
    staleTime: defaultStaleTime,
  });
}

export function useGuildTags(guildId: string | undefined, enabled = true) {
  return useQuery<Record<string, Tag>>({
    queryKey: guildKeys.tags(guildId || ""),
    queryFn: () => apiClient.tags.getByGuild(guildId!).then((res) => res.data),
    enabled: useGuildQueryEnabled(guildId, enabled),
    staleTime: defaultStaleTime,
  });
}

export function useGuildTicketLabels(guildId: string | undefined, enabled = true) {
  return useQuery<TicketLabel[]>({
    queryKey: guildKeys.ticketLabels(guildId || ""),
    queryFn: () => apiClient.ticketLabels.getByGuild(guildId!).then((res) => res.data ?? []),
    enabled: useGuildQueryEnabled(guildId, enabled),
    staleTime: defaultStaleTime,
  });
}

/** Gallery submissions are non-critical; enable only on panels list. */
export function useGuildGallerySubmissions(guildId: string | undefined, enabled = false) {
  return useQuery<GallerySubmission[]>({
    queryKey: guildKeys.gallerySubmissions(guildId || ""),
    queryFn: () => apiClient.gallery.submissions(guildId!).then((res) => res.data),
    enabled: useGuildQueryEnabled(guildId, enabled),
    staleTime: defaultStaleTime,
  });
}
