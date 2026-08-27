import { useState, useEffect, useMemo, useCallback } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import ConfirmModal from "@/components/modals/ConfirmModal";
import Button from "@/components/Button";
import TextInput from "@/components/TextInput";
import SearchInput from "@/components/SearchInput";
import { apiClient } from "@/lib/api";
import { toast } from "sonner";
import type { ServerBlacklistEntry } from "@/types";
import TableSkeleton from "@/components/skeletons/TableSkeleton";
import { useUrlSearch } from "@/hooks/useUrlSearch";
import { matchesSearch } from "@/lib/search";
import { useAuthStore } from "@/stores/auth";
import { isAtLeast } from "@/lib/admin-tier";

export default function ServerBlacklistPage() {
  const { user } = useAuthStore();
  const canModify = isAtLeast(user?.admin_tier ?? "", "admin");
  const [entries, setEntries] = useState<ServerBlacklistEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newGuildId, setNewGuildId] = useState("");
  const [newReason, setNewReason] = useState("");
  const { searchQuery, setSearchQuery, debouncedSearch } = useUrlSearch();
  const [deleteTarget, setDeleteTarget] = useState<ServerBlacklistEntry | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  const fetchEntries = useCallback(async () => {
    try {
      const res = await apiClient.admin.serverBlacklist.list();
      setEntries(res.data);
    } catch {
      // Error handled by interceptor
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const filteredEntries = useMemo(
    () => entries.filter((e) => matchesSearch(debouncedSearch, e.guild_id, e.reason)),
    [entries, debouncedSearch],
  );

  const handleAdd = async () => {
    const trimmedId = newGuildId.trim();
    if (!trimmedId) return;

    if (!/^\d+$/.test(trimmedId)) {
      toast.error("Please enter a valid server ID.");
      return;
    }

    setIsAdding(true);
    try {
      const reason = newReason.trim() || undefined;
      await apiClient.admin.serverBlacklist.add(trimmedId, { reason });
      toast.success("Server blacklisted successfully.");
      setNewGuildId("");
      setNewReason("");
      await fetchEntries();
    } catch {
      // Error handled by interceptor
    } finally {
      setIsAdding(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    try {
      await apiClient.admin.serverBlacklist.remove(deleteTarget.guild_id);
      toast.success("Server removed from blacklist.");
      setDeleteTarget(null);
      await fetchEntries();
    } catch {
      // Error handled by interceptor
    }
  };

  if (isLoading) {
    return <TableSkeleton rows={4} columns={3} />;
  }

  return (
    <div>
      <header className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-semibold mb-2 text-center">Server Blacklist</h1>
        <p className="text-center text-gray-400 text-sm sm:text-base">
          Servers banned from the platform
        </p>
      </header>

      {/* Add Server Section */}
      {canModify && (
        <div className="bg-gray-800 rounded-xl p-4 sm:p-6 mb-6">
          <h2 className="text-lg font-medium mb-3">Blacklist Server</h2>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row gap-3">
              <TextInput
                value={newGuildId}
                onChange={setNewGuildId}
                placeholder="Enter server ID..."
                className="flex-1"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAdd();
                }}
              />
              <TextInput
                value={newReason}
                onChange={setNewReason}
                placeholder="Reason (optional)..."
                className="flex-1"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAdd();
                }}
              />
            </div>
            <div>
              <Button
                variant="danger"
                onClick={handleAdd}
                disabled={isAdding || !newGuildId.trim()}
              >
                {isAdding ? "Adding..." : "Blacklist Server"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="flex justify-end mb-4">
        <SearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Search servers..."
          label="Search by server ID or reason"
          className="w-full sm:w-1/2 md:w-1/3 lg:w-1/4"
        />
      </div>

      {/* Server Grid */}
      <div
        className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
        role="list"
        aria-label="Blacklisted servers"
      >
        {filteredEntries.map((entry) => (
          <div
            key={entry.guild_id}
            role="listitem"
            className="group bg-gray-800 p-4 rounded-lg hover:bg-gray-700 transition"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <p className="font-mono text-sm text-white mb-1">{entry.guild_id}</p>
                {entry.reason && (
                  <p className="text-gray-400 text-sm mb-2 truncate">{entry.reason}</p>
                )}
                <div className="space-y-1">
                  {entry.owner_id && (
                    <p className="text-gray-500 text-xs">
                      Owner: <span className="font-mono">{entry.owner_id}</span>
                    </p>
                  )}
                  {entry.real_owner_id && (
                    <p className="text-gray-500 text-xs">
                      Real Owner: <span className="font-mono">{entry.real_owner_id}</span>
                    </p>
                  )}
                </div>
              </div>
              {canModify && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setDeleteTarget(entry)}
                  className="opacity-0 group-hover:opacity-100 text-green-400 hover:text-green-300 hover:bg-green-900/30 transition-all ml-2"
                  title={`Remove server ${entry.guild_id} from blacklist`}
                >
                  <FontAwesomeIcon icon="trash" aria-hidden="true" />
                  <span className="sr-only">Remove server {entry.guild_id} from blacklist</span>
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>

      {filteredEntries.length === 0 && (
        <p className="text-gray-400 text-center py-8">
          {searchQuery
            ? `No servers found matching "${searchQuery}".`
            : "No blacklisted servers found."}
        </p>
      )}

      {canModify && (
        <ConfirmModal
          isOpen={deleteTarget !== null}
          title="Remove from Blacklist"
          message={`Are you sure you want to remove server ${deleteTarget?.guild_id ?? ""} from the blacklist?`}
          confirmText="Remove"
          confirmVariant="success"
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
