import { useState, useEffect, useMemo, useCallback } from "react";
import { userAvatarUrl } from "@/lib/discord-cdn";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import ConfirmModal from "@/components/modals/ConfirmModal";
import Button from "@/components/Button";
import TextInput from "@/components/TextInput";
import SearchInput from "@/components/SearchInput";
import { apiClient } from "@/lib/api";
import { toast } from "sonner";
import type { GlobalBlacklistEntry } from "@/types";
import TableSkeleton from "@/components/skeletons/TableSkeleton";
import { useUrlSearch } from "@/hooks/useUrlSearch";
import { matchesSearch } from "@/lib/search";

export default function GlobalBlacklistPage() {
  const [entries, setEntries] = useState<GlobalBlacklistEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newUserId, setNewUserId] = useState("");
  const { searchQuery, setSearchQuery, debouncedSearch } = useUrlSearch();
  const [deleteTarget, setDeleteTarget] = useState<GlobalBlacklistEntry | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  const fetchEntries = useCallback(async () => {
    try {
      const res = await apiClient.admin.globalBlacklist.list();
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
    () => entries.filter((e) => matchesSearch(debouncedSearch, e.username, e.id)),
    [entries, debouncedSearch],
  );

  const handleAdd = async () => {
    const trimmed = newUserId.trim();
    if (!trimmed) return;

    if (!/^\d+$/.test(trimmed)) {
      toast.error("Please enter a valid user ID.");
      return;
    }

    setIsAdding(true);
    try {
      await apiClient.admin.globalBlacklist.add(trimmed);
      toast.success("User blacklisted successfully.");
      setNewUserId("");
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
      await apiClient.admin.globalBlacklist.remove(deleteTarget.id);
      toast.success("User removed from blacklist.");
      setDeleteTarget(null);
      await fetchEntries();
    } catch {
      // Error handled by interceptor
    }
  };

  const getAvatarUrl = (entry: GlobalBlacklistEntry): string =>
    userAvatarUrl(entry.id, entry.avatar_url ?? null);

  if (isLoading) {
    return <TableSkeleton rows={4} columns={3} />;
  }

  return (
    <div>
      <header className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-semibold mb-2 text-center">Global Blacklist</h1>
        <p className="text-center text-gray-400 text-sm sm:text-base">
          Users banned from the platform
        </p>
      </header>

      {/* Add User Section */}
      <div className="bg-gray-800 rounded-xl p-4 sm:p-6 mb-6">
        <h2 className="text-lg font-medium mb-3">Blacklist User</h2>
        <div className="flex flex-col sm:flex-row gap-3">
          <TextInput
            value={newUserId}
            onChange={setNewUserId}
            placeholder="Enter user ID..."
            className="flex-1"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAdd();
            }}
          />
          <Button variant="danger" onClick={handleAdd} disabled={isAdding || !newUserId.trim()}>
            {isAdding ? "Adding..." : "Blacklist User"}
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="flex justify-end mb-4">
        <SearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Search users..."
          label="Search by username or ID"
          className="w-full sm:w-1/2 md:w-1/3 lg:w-1/4"
        />
      </div>

      {/* User Grid */}
      <div
        className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
        role="list"
        aria-label="Blacklisted users"
      >
        {filteredEntries.map((entry) => (
          <div
            key={entry.id}
            role="listitem"
            className="group flex items-center space-x-4 bg-gray-800 p-4 rounded-lg hover:bg-gray-700 transition"
          >
            <div className="w-12 h-12 rounded-md overflow-hidden shrink-0">
              <img
                src={getAvatarUrl(entry)}
                alt={`${entry.username} avatar`}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-medium truncate">{entry.username}</h3>
              <p className="text-gray-400 text-sm font-mono truncate">{entry.id}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setDeleteTarget(entry)}
              className="opacity-0 group-hover:opacity-100 text-green-400 hover:text-green-300 hover:bg-green-900/30 transition-all"
              title={`Remove ${entry.username} from blacklist`}
            >
              <FontAwesomeIcon icon="trash" aria-hidden="true" />
              <span className="sr-only">Remove {entry.username} from blacklist</span>
            </Button>
          </div>
        ))}
      </div>

      {filteredEntries.length === 0 && (
        <p className="text-gray-400 text-center py-8">
          {searchQuery
            ? `No users found matching "${searchQuery}".`
            : "No blacklisted users found."}
        </p>
      )}

      <ConfirmModal
        isOpen={deleteTarget !== null}
        title="Remove from Blacklist"
        message={`Are you sure you want to remove ${deleteTarget?.username ?? "this user"} from the global blacklist?`}
        confirmText="Remove"
        confirmVariant="success"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
