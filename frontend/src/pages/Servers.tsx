import { useState, useEffect, useMemo, useCallback } from "react";
import type { CSSProperties, FC } from "react";
import { usePreferencesStore, type ServerListView } from "@/stores/preferences";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faGrip, faTableColumns } from "@fortawesome/free-solid-svg-icons";
import { toast } from "sonner";

import Button from "@/components/Button";
import SearchInput from "@/components/SearchInput";
import Server from "@/components/Server";
import ServerIconTile from "@/components/ServerIconTile";
import ServerIconLegend from "@/components/ServerIconLegend";
import CardGridSkeleton from "@/components/skeletons/CardGridSkeleton";
import IconGridSkeleton from "@/components/skeletons/IconGridSkeleton";
import { MainLayout } from "./layout/Main";
import { useAuthStore } from "@/stores/auth";
import { useGuildStore } from "@/stores/guild";
import { apiClient } from "@/lib/api";
import { useUrlSearch } from "@/hooks/useUrlSearch";
import { matchesSearch } from "@/lib/search";
import { sortGuildsForPicker } from "@/lib/guild-picker";
import type { Guild } from "@/types";

const ServersPage: FC = () => {
  const { searchQuery, setSearchQuery, debouncedSearch } = useUrlSearch();
  const servers = useAuthStore((s) => s.guilds);
  const setGuilds = useAuthStore((s) => s.setGuilds);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(() => useAuthStore.getState().guilds.length > 0);
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

  useEffect(() => {
    if (servers.length > 0) {
      setHasLoaded(true);
    }
  }, [servers]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const res = await apiClient.guilds.reload();
      if (res.data.reauthenticate_required) {
        window.location.href = "/logout";
        return;
      }
      setGuilds(res.data.guilds);
      toast.success("Server list refreshed");
    } catch {
      toast.error("Failed to refresh server list");
    } finally {
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

  const toolbar = (
    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6">
      <div className="flex flex-wrap items-center justify-between gap-3 sm:justify-start">
        <Button
          variant="primary"
          onClick={handleRefresh}
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

  if (!hasLoaded) {
    return (
      <MainLayout
        title="Select a Server"
        subtitle="Click on a server to manage it or view its details."
      >
        {toolbar}
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
        {toolbar}
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
        {filteredAllSorted.length === 0 ? (
          <p className="text-gray-300 text-center py-12 animate-fade-in">
            No servers found{searchQuery && ` matching "${searchQuery}"`}.
          </p>
        ) : (
          <div className="animate-fade-in anim-delay-300">
            <ServerIconLegend />
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
      {toolbar}

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
    </MainLayout>
  );
};

export default ServersPage;
