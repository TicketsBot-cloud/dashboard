import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import type { CSSProperties, FC } from "react";
import { usePreferencesStore, type ServerListView } from "@/stores/preferences";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowUpRightFromSquare,
  faGrip,
  faTableColumns,
} from "@fortawesome/free-solid-svg-icons";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import Button, { buttonLinkClassName } from "@/components/Button";
import InviteServersSection from "@/components/InviteServersSection";
import SearchInput from "@/components/SearchInput";
import Server from "@/components/Server";
import ServerIconTile from "@/components/ServerIconTile";
import ServerIconLegend from "@/components/ServerIconLegend";
import CardGridSkeleton from "@/components/skeletons/CardGridSkeleton";
import IconGridSkeleton from "@/components/skeletons/IconGridSkeleton";
import { MainLayout } from "./layout/Main";
import { useAuthStore } from "@/stores/auth";
import { useGuildStore } from "@/stores/guild";
import { apiClient, SKIP_ERROR_TOAST } from "@/lib/api";
import { buildInviteUrl } from "@/lib/invite";
import {
  invitableGuildsKey,
  showsPerServerInvite,
  showsToolbarInvite,
  useInvitableGuilds,
  useServerListInviteVariant,
} from "@/hooks/useServerListInvite";
import { useUrlSearch } from "@/hooks/useUrlSearch";
import { matchesSearch } from "@/lib/search";
import { sortGuildsForPicker } from "@/lib/guild-picker";
import type { Guild, InvitableGuild } from "@/types";

const ServersPage: FC = () => {
  const { searchQuery, setSearchQuery, debouncedSearch } = useUrlSearch();
  const servers = useAuthStore((s) => s.guilds);
  const setGuilds = useAuthStore((s) => s.setGuilds);
  // Guilds are persisted and set during the OAuth callback, so once the store has
  // rehydrated the list is final, including when it is genuinely empty.
  const hasLoaded = useAuthStore((s) => !s.isLoading);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const queryClient = useQueryClient();

  const inviteVariant = useServerListInviteVariant();
  const showToolbarInvite = showsToolbarInvite(inviteVariant);
  const showPerServerInvite = showsPerServerInvite(inviteVariant);
  const invitableQuery = useInvitableGuilds(showPerServerInvite);

  const [inviteClicked, setInviteClicked] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [focusStatusRefresh, setFocusStatusRefresh] = useState(false);
  const statusRefreshRef = useRef<HTMLButtonElement>(null);
  const isRefreshingRef = useRef(false);
  const invitableRef = useRef<InvitableGuild[]>([]);
  const reloadOnFocusRef = useRef(false);
  // The reload endpoint is rate limited to one call per 10s.
  const lastReloadAtRef = useRef(0);
  const { selectGuild } = useGuildStore();
  const viewMode = usePreferencesStore((s) => s.servers.view);
  const setServersPrefs = usePreferencesStore((s) => s.setServersPrefs);

  const setViewMode = useCallback(
    (mode: ServerListView) => {
      setServersPrefs({ view: mode });
    },
    [setServersPrefs],
  );

  useEffect(() => {
    selectGuild(null);
  }, [selectGuild]);

  const invalidateInvitable = useCallback(
    () => queryClient.invalidateQueries({ queryKey: invitableGuildsKey }),
    [queryClient],
  );

  const handleInviteClick = useCallback(() => {
    setInviteClicked(true);
    reloadOnFocusRef.current = true;
  }, []);

  // A reload can remove the invite row that holds focus, so focus is handed to the
  // status line's Refresh button and the newly added servers are announced there.
  const applyReloadedGuilds = useCallback(
    (guilds: Guild[]) => {
      const joined = new Set(guilds.map((g) => g.id));
      const added = invitableRef.current.filter((g) => joined.has(g.id));
      const focusInInviteSection = !!document.activeElement?.closest("[data-invite-servers]");

      setGuilds(guilds);
      void invalidateInvitable();

      if (added.length === 1) {
        setStatusMessage(`Tickets added to ${added[0].name}.`);
      } else if (added.length > 1) {
        setStatusMessage(`Tickets added to ${added.length} servers.`);
      }
      if (focusInInviteSection) setFocusStatusRefresh(true);
    },
    [setGuilds, invalidateInvitable],
  );

  useEffect(() => {
    if (!focusStatusRefresh) return;
    statusRefreshRef.current?.focus();
    setFocusStatusRefresh(false);
  }, [focusStatusRefresh]);

  useEffect(() => {
    // Stays pending until a reload succeeds, so a 429 or a return inside the 10s
    // window retries on a later focus. Never polls.
    const onFocus = async () => {
      if (!reloadOnFocusRef.current || Date.now() - lastReloadAtRef.current < 10_000) return;
      lastReloadAtRef.current = Date.now();
      try {
        const res = await apiClient.guilds.reload(SKIP_ERROR_TOAST);
        reloadOnFocusRef.current = false;
        if (res.data.reauthenticate_required) return;
        applyReloadedGuilds(res.data.guilds);
      } catch {
        // Silent by design: the user can still press Refresh list.
      }
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [applyReloadedGuilds]);

  const handleRefresh = async (fromStatusLine = false) => {
    if (isRefreshingRef.current) return;
    isRefreshingRef.current = true;
    setIsRefreshing(true);
    lastReloadAtRef.current = Date.now();
    try {
      const res = await apiClient.guilds.reload();
      if (res.data.reauthenticate_required) {
        window.location.href = "/logout";
        return;
      }
      if (fromStatusLine) {
        applyReloadedGuilds(res.data.guilds);
      } else {
        setGuilds(res.data.guilds);
        void invalidateInvitable();
      }
      toast.success("Server list refreshed");
    } catch {
      toast.error("Failed to refresh server list");
    } finally {
      isRefreshingRef.current = false;
      setIsRefreshing(false);
    }
  };

  const matches = useCallback(
    (s: Guild) => matchesSearch(debouncedSearch, s.name, s.id),
    [debouncedSearch],
  );

  const { filteredManageable, filteredOthers, filteredAllSorted } = useMemo(() => {
    const manageable = servers?.filter((s) => s.permission_level > 0) ?? [];
    const others = servers?.filter((s) => !s.permission_level || s.permission_level === 0) ?? [];

    const filteredManageable = sortGuildsForPicker(manageable.filter(matches));
    const filteredOthers = sortGuildsForPicker(others.filter(matches));
    const filteredAllSorted = sortGuildsForPicker([...manageable, ...others].filter(matches));

    return { filteredManageable, filteredOthers, filteredAllSorted };
  }, [servers, matches]);

  const sortedPremium = useMemo(
    () => filteredManageable.filter((s) => s.premium),
    [filteredManageable],
  );
  const sortedFree = useMemo(
    () => filteredManageable.filter((s) => !s.premium),
    [filteredManageable],
  );

  const invitable = useMemo(() => {
    if (!showPerServerInvite || !invitableQuery.data) return [];
    // Covers the gap between a reload adding the guild and the invitable refetch.
    const joined = new Set(servers.map((s) => s.id));
    return invitableQuery.data.filter((g) => !joined.has(g.id));
  }, [showPerServerInvite, invitableQuery.data, servers]);
  useEffect(() => {
    invitableRef.current = invitable;
  }, [invitable]);
  const filteredInvitable = useMemo(
    () => invitable.filter((g) => matchesSearch(debouncedSearch, g.name, g.id)),
    [invitable, debouncedSearch],
  );

  // The control keeps today's empty rendering (the usual sections with their
  // placeholders), so only the invite variants get the dedicated empty state.
  const hasNoServers = servers.length === 0 && inviteVariant !== "off";
  const hasNoManageable = !servers.some((s) => s.permission_level > 0);
  const showInviteSection = filteredInvitable.length > 0;
  const inviteSectionAtTop = showInviteSection && hasNoManageable;

  // Only reached when the user has no servers with Tickets in them and there is
  // nothing to show in the per-server section. Null while the answer is unknown,
  // so the wrong copy never flashes.
  const emptyStateMessage = (() => {
    if (!inviteVariant) return null;
    if (showPerServerInvite && invitableQuery.isLoading) return null;
    if (showToolbarInvite)
      return "Tickets is not in any of your servers yet. Use Invite bot to add it.";
    return (
      <>
        Tickets is not in any server you are a member of. Add it from the{" "}
        <a
          href={buildInviteUrl()}
          target="_blank"
          rel="noopener noreferrer"
          onClick={handleInviteClick}
          className="text-blue-400 hover:text-blue-300 underline"
        >
          invite page<span className="sr-only">, opens in a new tab</span>
        </a>
        , then refresh this list.
      </>
    );
  })();

  const noSearchMatches = (
    <p className="text-gray-300 text-center py-12 animate-fade-in">
      No servers found{searchQuery && ` matching "${searchQuery}"`}.
    </p>
  );

  // Rendered when the user is in no servers with Tickets, in place of the usual sections.
  const noServersContent =
    invitable.length > 0 ? (
      showInviteSection ? (
        <InviteServersSection
          guilds={filteredInvitable}
          view={viewMode === "icons" ? "icons" : "cards"}
          animate={!debouncedSearch}
          onInviteClick={handleInviteClick}
        />
      ) : (
        noSearchMatches
      )
    ) : (
      emptyStateMessage && (
        <p className="text-gray-300 text-center py-12 animate-fade-in">{emptyStateMessage}</p>
      )
    );

  const toolbar = (
    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6">
      <div className="flex flex-wrap items-center justify-between gap-3 sm:justify-start">
        <Button
          variant="primary"
          onClick={() => void handleRefresh()}
          disabled={isRefreshing}
          className="shrink-0 whitespace-nowrap"
        >
          <FontAwesomeIcon
            icon="sync"
            className={isRefreshing ? "animate-spin" : ""}
            aria-hidden="true"
          />
          Refresh list
        </Button>
        {showToolbarInvite && (
          <a
            href={buildInviteUrl()}
            target="_blank"
            rel="noopener noreferrer"
            onClick={handleInviteClick}
            aria-label="Invite bot, opens in a new tab"
            className={`${buttonLinkClassName("outline")} shrink-0 whitespace-nowrap`}
          >
            Invite bot
            <FontAwesomeIcon
              icon={faArrowUpRightFromSquare}
              className="h-3 w-3"
              aria-hidden="true"
            />
          </a>
        )}
        <div
          className="flex items-stretch self-stretch rounded-lg border border-gray-600 overflow-hidden"
          role="group"
          aria-label="Server list view"
        >
          <Button
            type="button"
            size="icon"
            variant={viewMode === "cards" ? "primary" : "ghost"}
            onClick={() => setViewMode("cards")}
            aria-pressed={viewMode === "cards"}
            aria-label="Card view"
            title="Card view"
            className="rounded-none w-10"
          >
            <FontAwesomeIcon icon={faTableColumns} className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant={viewMode === "icons" ? "primary" : "ghost"}
            onClick={() => setViewMode("icons")}
            aria-pressed={viewMode === "icons"}
            aria-label="Icon view"
            title="Icon view"
            className="rounded-none w-10"
          >
            <FontAwesomeIcon icon={faGrip} className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </div>
      <SearchInput
        value={searchQuery}
        onChange={setSearchQuery}
        placeholder="Search servers..."
        label="Search servers by name or ID"
        description="Search by server name or ID to filter the server list"
        className="w-full sm:w-1/2 md:w-1/3 lg:w-1/4"
      />
    </div>
  );

  const header = (
    <>
      {toolbar}
      <div
        role="status"
        className={
          inviteClicked ? "flex flex-wrap items-center gap-2 text-sm text-gray-300 mb-6" : ""
        }
      >
        {inviteClicked && (
          <>
            <span>
              {statusMessage ?? "Once you have added Tickets, it can take a few seconds to appear."}
            </span>
            <Button
              ref={statusRefreshRef}
              variant="ghost"
              size="sm"
              onClick={() => void handleRefresh(true)}
              visuallyDisabled={isRefreshing}
              aria-busy={isRefreshing || undefined}
            >
              Refresh list
            </Button>
          </>
        )}
      </div>
    </>
  );

  if (!hasLoaded) {
    return (
      <MainLayout
        title="Select a Server"
        subtitle="Click on a server to manage it or view its details."
      >
        {header}
        {viewMode === "icons" ? <IconGridSkeleton /> : <CardGridSkeleton cards={6} sections={3} />}
      </MainLayout>
    );
  }

  if (viewMode === "icons") {
    return (
      <MainLayout
        title="Select a Server"
        subtitle="Click on a server to manage it or view its details."
      >
        {header}
        {hasNoServers ? (
          noServersContent
        ) : (
          <>
            <div
              className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-x-6 gap-y-8 place-items-center"
              role="list"
              aria-label="Servers"
            >
              {filteredAllSorted.map((server, i) => (
                <div
                  key={server.id}
                  role="listitem"
                  className="animate-fade-in-up anim-stagger"
                  style={{ "--anim-i": debouncedSearch ? 0 : Math.min(i, 14) } as CSSProperties}
                >
                  <ServerIconTile guild={server} />
                </div>
              ))}
            </div>
            {filteredAllSorted.length === 0 && noSearchMatches}
          </>
        )}
        {!hasNoServers && showInviteSection && (
          <InviteServersSection
            guilds={filteredInvitable}
            view="icons"
            animate={!debouncedSearch}
            onInviteClick={handleInviteClick}
            className="mt-12"
          />
        )}
        {(filteredAllSorted.length > 0 || showInviteSection) && (
          <div className="animate-fade-in anim-delay-300">
            <ServerIconLegend showInvite={showInviteSection} />
          </div>
        )}
      </MainLayout>
    );
  }

  return (
    <MainLayout
      title="Select a Server"
      subtitle="Click on a server to manage it or view its details."
    >
      {header}

      {hasNoServers ? (
        noServersContent
      ) : (
        <>
          {inviteSectionAtTop && (
            <InviteServersSection
              guilds={filteredInvitable}
              view="cards"
              animate={!debouncedSearch}
              onInviteClick={handleInviteClick}
              className="mb-12"
            />
          )}

          {!inviteSectionAtTop && (
            <section className="mb-12" aria-labelledby="premium-servers-heading">
              <div className="pb-4 flex items-center justify-between">
                <h2 id="premium-servers-heading" className="text-xl font-medium mb-4">
                  Premium Servers
                </h2>
              </div>
              <div
                className="grid gap-4 grid-cols-1 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
                role="list"
                aria-label="Premium servers"
              >
                {sortedPremium.map((server, i) => (
                  <div
                    key={server.id}
                    role="listitem"
                    className="animate-fade-in-up anim-stagger"
                    style={{ "--anim-i": debouncedSearch ? 0 : Math.min(i, 14) } as CSSProperties}
                  >
                    <Server guild={server} />
                  </div>
                ))}
              </div>
              {sortedPremium.length === 0 && (
                <p className="text-gray-300 text-center py-8 animate-fade-in">
                  No premium servers found{searchQuery && ` matching "${searchQuery}"`}.
                </p>
              )}
            </section>
          )}

          {!inviteSectionAtTop && (
            <section className="mb-12" aria-labelledby="manageable-servers-heading">
              <div className="pb-4 flex items-center justify-between">
                <h2 id="manageable-servers-heading" className="text-xl font-medium mb-4">
                  Free Servers
                </h2>
              </div>
              <div
                className="grid gap-4 grid-cols-1 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
                role="list"
                aria-label="Free servers"
              >
                {sortedFree.map((server, i) => (
                  <div
                    key={server.id}
                    role="listitem"
                    className="animate-fade-in-up anim-stagger"
                    style={
                      {
                        "--anim-i": debouncedSearch ? 0 : Math.min(sortedPremium.length + i, 14),
                      } as CSSProperties
                    }
                  >
                    <Server guild={server} />
                  </div>
                ))}
              </div>
              {sortedFree.length === 0 && (
                <p className="text-gray-300 text-center py-8 animate-fade-in">
                  No free servers found{searchQuery && ` matching "${searchQuery}"`}.
                </p>
              )}
            </section>
          )}

          {showInviteSection && !inviteSectionAtTop && (
            <InviteServersSection
              guilds={filteredInvitable}
              view="cards"
              animate={!debouncedSearch}
              onInviteClick={handleInviteClick}
              className="mb-12"
            />
          )}

          <section aria-labelledby="other-servers-heading">
            <h2 id="other-servers-heading" className="text-xl font-medium mb-4">
              Other Servers
            </h2>
            <p className="text-sm text-gray-300 mb-4">
              You do not have access to managing these servers.
            </p>
            <div
              className="grid gap-4 grid-cols-1 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 pt-3"
              role="list"
              aria-label="Servers you cannot manage"
            >
              {filteredOthers.map((server, i) => (
                <div
                  key={server.id}
                  role="listitem"
                  className="animate-fade-in-up anim-stagger"
                  style={
                    {
                      "--anim-i": debouncedSearch
                        ? 0
                        : Math.min(sortedPremium.length + sortedFree.length + i, 14),
                    } as CSSProperties
                  }
                >
                  <Server guild={server} />
                </div>
              ))}
            </div>
            {filteredOthers.length === 0 && (
              <p className="text-gray-300 text-center py-8 animate-fade-in">
                No other servers found{searchQuery && ` matching "${searchQuery}"`}.
              </p>
            )}
          </section>
        </>
      )}
    </MainLayout>
  );
};

export default ServersPage;
