import { useEffect, useState } from "react";
import { Outlet, useNavigate } from "react-router";
import { GuildContext } from "@/state/context";
import { GuildBootstrapContext } from "@/state/guildBootstrapContext";
import { useMatch, useParams } from "react-router";
import { apiClient } from "@/lib/api";
import { getGuildById, useAuthStore } from "@/stores/auth";
import { useGuildStore } from "@/stores/guild";
import { useOnboardingStore } from "@/stores/onboarding";
import { toast } from "sonner";
import OnboardingBanner from "@/pages/manage/setup/components/OnboardingBanner";
import type { Guild } from "@/types";

export default function GuildLayout() {
  const { guildId } = useParams();
  const navigate = useNavigate();
  const { selectedGuild, selectGuild, updateGuild } = useGuildStore();
  const updateGuildPermission = useAuthStore((s) => s.updateGuildPermission);
  const { setState: setOnboardingState, reset: resetOnboarding } = useOnboardingStore();
  const [verified, setVerified] = useState(false);
  const [bootstrapReady, setBootstrapReady] = useState(false);

  const isTranscriptView = useMatch("/manage/:guildId/transcripts/view/:id") !== null;

  useEffect(() => {
    if (!guildId) {
      console.error("No guild ID provided in URL");
      selectGuild(null);
      setBootstrapReady(false);
      return;
    }

    setVerified(false);
    setBootstrapReady(false);
    resetOnboarding();

    let cancelled = false;

    const enterAsTicketOpener = (level: number) => {
      const stored = getGuildById(guildId);
      selectGuild({
        id: guildId,
        name: stored?.name ?? "",
        icon: stored?.icon,
        permission_level: level,
      });
      setVerified(true);
      setBootstrapReady(true);
    };

    const verifyAndLoad = async () => {
      let serverLevel: number;
      try {
        const res = await apiClient.user.getPermissionLevel(guildId);
        serverLevel = res.data.permission_level;
        updateGuildPermission(guildId, serverLevel);
      } catch {
        if (cancelled) return;
        if (isTranscriptView) {
          enterAsTicketOpener(0);
          return;
        }
        selectGuild(null);
        toast.error("Failed to verify permissions.");
        navigate("/", { replace: true });
        return;
      }

      if (serverLevel < 1) {
        if (cancelled) return;
        if (isTranscriptView) {
          enterAsTicketOpener(serverLevel);
          return;
        }
        selectGuild(null);
        toast.warning("You do not have permission to view this page.");
        navigate("/", { replace: true });
        return;
      }

      let guild: Guild | null = getGuildById(guildId);
      if (!guild) {
        try {
          const guildRes = await apiClient.guilds.getInfo(guildId);
          guild = {
            id: guildId,
            name: guildRes.data.name,
            icon: guildRes.data.icon ?? undefined,
            permission_level: serverLevel,
          };
        } catch {
          if (cancelled) return;
          selectGuild(null);
          navigate("/", { replace: true });
          return;
        }
      }

      const mergedGuild: Guild = {
        id: guild!.id,
        name: guild!.name,
        icon: guild!.icon,
        permission_level: serverLevel,
      };

      selectGuild(mergedGuild);
      if (cancelled) return;
      setVerified(true);

      try {
        const [channelsRes, rolesRes, teamsRes] = await Promise.all([
          apiClient.guilds.getChannels(guildId),
          apiClient.guilds.getRoles(guildId),
          // Team endpoint is Bot Admin (level 2) only; skip for Support Reps
          serverLevel >= 2 ? apiClient.teams.getByGuild(guildId) : Promise.resolve(null),
        ]);
        if (cancelled) return;

        const bootstrapPatch = {
          channels: channelsRes.data,
          roles: rolesRes.data.roles,
          teams: teamsRes?.data ?? [],
        };
        updateGuild(guildId, bootstrapPatch);
        selectGuild({ ...mergedGuild, ...bootstrapPatch });
      } catch (error) {
        console.error("Failed to fetch guild data:", error);
      }

      if (!cancelled) {
        setBootstrapReady(true);
      }

      // Onboarding endpoint is Bot Admin (level 2) only; the banner is a setup CTA
      if (serverLevel >= 2) {
        try {
          const onboardingRes = await apiClient.onboarding.get(guildId);
          if (!cancelled) {
            setOnboardingState(onboardingRes.data);
          }
        } catch {
          // Non-critical - banner just won't show
        }
      }
    };

    verifyAndLoad();

    return () => {
      cancelled = true;
    };
  }, [
    guildId,
    selectGuild,
    updateGuild,
    updateGuildPermission,
    navigate,
    setOnboardingState,
    resetOnboarding,
    isTranscriptView,
  ]);

  if (!verified || !bootstrapReady) {
    const guildName = selectedGuild?.name ?? getGuildById(guildId ?? "")?.name;

    return (
      <div className="h-full bg-gray-900 text-gray-100 flex items-center justify-center">
        <div className="text-center" role="status" aria-live="polite">
          <div
            className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"
            aria-hidden="true"
          />
          <p className="text-gray-400">{guildName ? `Loading ${guildName}…` : "Loading server…"}</p>
        </div>
      </div>
    );
  }

  return (
    <GuildBootstrapContext.Provider value={true}>
      <GuildContext.Provider value={selectedGuild == undefined ? null : selectedGuild}>
        {guildId && (selectedGuild?.permission_level ?? 0) >= 2 && (
          <OnboardingBanner guildId={guildId} />
        )}
        <Outlet />
      </GuildContext.Provider>
    </GuildBootstrapContext.Provider>
  );
}
