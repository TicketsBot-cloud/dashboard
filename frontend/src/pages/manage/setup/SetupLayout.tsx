import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router";
import { SkeletonTheme } from "react-loading-skeleton";
import { toast, Toaster } from "sonner";

import { GuildContext } from "@/state/context";
import { apiClient } from "@/lib/api";
import { getGuildById, useAuthStore } from "@/stores/auth";
import { useGuildStore } from "@/stores/guild";
import ErrorBoundary from "@/components/ErrorBoundary";
import SkipLinks from "@/components/SkipLinks";
import ErrorDetailModal from "@/components/modals/ErrorDetailModal";
import Button from "@/components/Button";
import { BASE_URL, BOT_ID } from "@/lib/constants";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import { SETUP_ONBOARDING_WIZARD_FLAG } from "@/lib/feature-flags";

import "react-loading-skeleton/dist/skeleton.css";

const Setup = lazy(() => import("./Setup"));

function SetupLayoutContent() {
  const { guildId } = useParams<{ guildId: string }>();
  const navigate = useNavigate();
  const { isLoading, isAuthenticated, guilds, accessToken } = useAuthStore();
  const { selectedGuild, selectGuild, updateGuild } = useGuildStore();
  const updateGuildPermission = useAuthStore((s) => s.updateGuildPermission);
  const [verified, setVerified] = useState(false);
  const { enabled: wizardEnabled, isLoading: flagLoading } = useFeatureFlag(
    SETUP_ONBOARDING_WIZARD_FLAG,
    guildId,
  );

  const handleLogin = useCallback(() => {
    const currentPath = new URL(window.location.href).pathname;
    const nonce = crypto.randomUUID();
    const statePayload = JSON.stringify({ path: currentPath, nonce });
    const state = btoa(statePayload);
    sessionStorage.setItem("oauth_state", state);
    const oauthUrl = `https://discordapp.com/oauth2/authorize?response_type=code&redirect_uri=${encodeURIComponent(
      BASE_URL + "/oauth2/callback",
    )}&scope=identify%20guilds&client_id=${BOT_ID}&state=${encodeURIComponent(state)}`;
    window.location.href = oauthUrl;
  }, []);

  const needsAuth = !isAuthenticated || !accessToken || guilds.length === 0;

  useEffect(() => {
    if (isLoading || needsAuth || flagLoading) return;
    if (!guildId) {
      selectGuild(null);
      return;
    }

    const g = getGuildById(guildId);
    if (!g) {
      selectGuild(null);
      toast.warning("You do not have permission to view this page.");
      navigate("/", { replace: true });
      return;
    }

    if (!wizardEnabled) {
      selectGuild(null);
      toast.warning("You do not have permission to view this page.");
      navigate("/", { replace: true });
      return;
    }

    setVerified(false);

    const verifyAndLoad = async () => {
      try {
        const res = await apiClient.user.getPermissionLevel(guildId);
        const serverLevel = res.data.permission_level;
        updateGuildPermission(guildId, serverLevel);

        if (serverLevel < 2) {
          selectGuild(null);
          toast.warning("You need administrator permissions to access the setup wizard.");
          navigate("/", { replace: true });
          return;
        }

        selectGuild({ ...g, permission_level: serverLevel });
        setVerified(true);
      } catch {
        selectGuild(null);
        toast.error("Failed to verify permissions.");
        navigate("/", { replace: true });
        return;
      }

      try {
        const [channelsRes, rolesRes, teamsRes] = await Promise.all([
          apiClient.guilds.getChannels(guildId),
          apiClient.guilds.getRoles(guildId),
          apiClient.teams.getByGuild(guildId),
        ]);
        updateGuild(guildId, {
          channels: channelsRes.data,
          roles: rolesRes.data.roles,
          teams: teamsRes.data,
        });
      } catch (error) {
        console.error("Failed to fetch guild data:", error);
      }
    };

    verifyAndLoad();
  }, [
    guildId,
    isLoading,
    needsAuth,
    flagLoading,
    wizardEnabled,
    selectGuild,
    updateGuild,
    updateGuildPermission,
    navigate,
  ]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-900 text-gray-100 flex items-center justify-center">
        <div className="text-center" role="status" aria-live="polite">
          <div
            className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"
            aria-hidden="true"
          ></div>
          <p className="text-gray-400">Loading application...</p>
          <span className="sr-only">Please wait while the application loads</span>
        </div>
      </div>
    );
  }

  if (needsAuth) {
    return (
      <div className="min-h-screen bg-gray-900 text-gray-100 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-3xl font-bold mb-2">Tickets</h1>
          <p className="text-gray-400 mb-8">Log in to set up your server.</p>
          <Button
            onClick={handleLogin}
            className="gap-2 bg-[#5865F2] hover:bg-[#4752C4] font-medium px-6 py-3 rounded-lg transition"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
            </svg>
            Log in with Discord
          </Button>
        </div>
      </div>
    );
  }

  if (flagLoading) {
    return (
      <div className="min-h-screen bg-gray-900 text-gray-100 flex items-center justify-center">
        <div className="text-center" role="status" aria-live="polite">
          <div
            className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"
            aria-hidden="true"
          ></div>
          <p className="text-gray-400">Loading application...</p>
          <span className="sr-only">Please wait while the application loads</span>
        </div>
      </div>
    );
  }

  if (!verified) {
    return (
      <div className="min-h-screen bg-gray-900 text-gray-100 flex items-center justify-center">
        <div className="text-center" role="status" aria-live="polite">
          <div
            className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"
            aria-hidden="true"
          ></div>
          <p className="text-gray-400">Verifying permissions...</p>
          <span className="sr-only">Please wait while your permissions are verified</span>
        </div>
      </div>
    );
  }

  return (
    <SkeletonTheme baseColor="#374151" highlightColor="#4B5563">
      <SkipLinks />
      <div className="h-dvh overflow-y-auto bg-gray-900 text-gray-100">
        <main
          id="main-content"
          className="mx-auto flex min-h-screen max-w-4xl flex-col px-4 py-8"
          role="main"
        >
          <GuildContext.Provider value={selectedGuild == undefined ? null : selectedGuild}>
            <Suspense
              fallback={
                <div
                  className="flex items-center justify-center py-16"
                  role="status"
                  aria-live="polite"
                >
                  <div
                    className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500"
                    aria-hidden="true"
                  ></div>
                  <span className="sr-only">Loading setup wizard...</span>
                </div>
              }
            >
              <Setup />
            </Suspense>
          </GuildContext.Provider>
        </main>
        <Toaster theme="dark" richColors position="bottom-right" visibleToasts={5} />
        <ErrorDetailModal />
      </div>
    </SkeletonTheme>
  );
}

function SetupLayout() {
  return (
    <ErrorBoundary>
      <SetupLayoutContent />
    </ErrorBoundary>
  );
}

export default SetupLayout;
