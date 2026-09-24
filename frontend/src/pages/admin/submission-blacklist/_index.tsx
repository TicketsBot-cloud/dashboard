import { useState, useEffect, useMemo, useCallback } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import BlacklistAvatar from "@/components/BlacklistAvatar";
import ConfirmModal from "@/components/modals/ConfirmModal";
import Button from "@/components/Button";
import TextInput from "@/components/TextInput";
import SearchInput from "@/components/SearchInput";
import Select from "@/components/Select";
import { apiClient } from "@/lib/api";
import { toast } from "sonner";
import type {
  SubmissionBlacklistEntry,
  SubmissionBlacklistFeature,
  SubmissionBlacklistTarget,
} from "@/types";
import TableSkeleton from "@/components/skeletons/TableSkeleton";
import { useUrlSearch } from "@/hooks/useUrlSearch";
import { matchesSearch } from "@/lib/search";
import { useAuthStore } from "@/stores/auth";
import { isAtLeast } from "@/lib/admin-tier";

const FEATURE_COPY: Record<SubmissionBlacklistFeature, { title: string; subtitle: string }> = {
  gallery: {
    title: "Gallery Blacklist",
    subtitle: "Users and servers blocked from submitting to the gallery",
  },
  integrations: {
    title: "Integration Blacklist",
    subtitle: "Users blocked from submitting integrations for public review",
  },
};

const TARGET_LABELS: Record<SubmissionBlacklistTarget, string> = {
  user: "User",
  guild: "Server",
};

const targetOptions = [
  { key: "user", label: TARGET_LABELS.user },
  { key: "guild", label: TARGET_LABELS.guild },
];

function entryName(entry: SubmissionBlacklistEntry): string {
  return entry.name ?? `Unknown ${TARGET_LABELS[entry.target_type]}`;
}

interface SubmissionBlacklistPageProps {
  feature: SubmissionBlacklistFeature;
}

export default function SubmissionBlacklistPage({ feature }: SubmissionBlacklistPageProps) {
  const { user } = useAuthStore();
  const canRemove = isAtLeast(user?.admin_tier ?? "", "owner");
  const copy = FEATURE_COPY[feature];
  const allowsGuild = feature === "gallery";
  const [entries, setEntries] = useState<SubmissionBlacklistEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newTargetType, setNewTargetType] = useState<SubmissionBlacklistTarget>("user");
  const [newTargetId, setNewTargetId] = useState("");
  const [newReason, setNewReason] = useState("");
  const { searchQuery, setSearchQuery, debouncedSearch } = useUrlSearch();
  const [deleteTarget, setDeleteTarget] = useState<SubmissionBlacklistEntry | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  const fetchEntries = useCallback(async () => {
    try {
      const res = await apiClient.admin.submissionBlacklist.list(feature);
      setEntries(res.data);
    } catch {
      // Error handled by interceptor
    } finally {
      setIsLoading(false);
    }
  }, [feature]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const filteredEntries = useMemo(
    () => entries.filter((e) => matchesSearch(debouncedSearch, e.name, e.target_id, e.reason)),
    [entries, debouncedSearch],
  );

  const targetLabel = TARGET_LABELS[newTargetType];

  const handleAdd = async () => {
    const trimmedId = newTargetId.trim();
    if (!trimmedId) return;

    if (!/^\d+$/.test(trimmedId)) {
      toast.error(`Please enter a valid ${targetLabel.toLowerCase()} ID.`);
      return;
    }

    setIsAdding(true);
    try {
      const reason = newReason.trim() || undefined;
      await apiClient.admin.submissionBlacklist.add(feature, newTargetType, trimmedId, { reason });
      toast.success(`${targetLabel} blacklisted successfully.`);
      setNewTargetId("");
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
      await apiClient.admin.submissionBlacklist.remove(
        feature,
        deleteTarget.target_type,
        deleteTarget.target_id,
      );
      toast.success(`${TARGET_LABELS[deleteTarget.target_type]} removed from blacklist.`);
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
        <h1 className="text-2xl sm:text-3xl font-semibold mb-2 text-center">{copy.title}</h1>
        <p className="text-center text-gray-400 text-sm sm:text-base">{copy.subtitle}</p>
      </header>

      <div className="bg-gray-800 rounded-xl p-4 sm:p-6 mb-6">
        <h2 className="text-lg font-medium mb-3">Blacklist {targetLabel}</h2>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row gap-3">
            {allowsGuild && (
              <div className="w-full sm:w-40">
                <Select
                  label="Target type"
                  hideLabel
                  value={newTargetType}
                  options={targetOptions}
                  onChange={(v) => setNewTargetType(v === "guild" ? "guild" : "user")}
                  hideSearch
                />
              </div>
            )}
            <TextInput
              value={newTargetId}
              onChange={setNewTargetId}
              placeholder={`Enter ${targetLabel.toLowerCase()} ID...`}
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
            <Button variant="danger" onClick={handleAdd} disabled={isAdding || !newTargetId.trim()}>
              {isAdding ? "Adding..." : `Blacklist ${targetLabel}`}
            </Button>
          </div>
        </div>
      </div>

      <div className="flex justify-end mb-4">
        <SearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Search entries..."
          label="Search by name, ID or reason"
          className="w-full sm:w-1/2 md:w-1/3 lg:w-1/4"
        />
      </div>

      <div
        className="grid gap-4 grid-cols-1 lg:grid-cols-2 xl:grid-cols-3"
        role="list"
        aria-label={`${copy.title} entries`}
      >
        {filteredEntries.map((entry) => (
          <div
            key={`${entry.target_type}:${entry.target_id}`}
            role="listitem"
            className="bg-gray-800 p-4 rounded-lg hover:bg-gray-700 transition"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-4">
                  <div className="w-12 h-12 rounded-md overflow-hidden shrink-0">
                    <BlacklistAvatar
                      targetType={entry.target_type}
                      targetId={entry.target_id}
                      label={entryName(entry)}
                      name={entry.name}
                      avatarUrl={entry.avatar_url}
                      icon={entry.icon}
                    />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-medium truncate">{entryName(entry)}</h3>
                    <p className="text-gray-400 text-sm font-mono truncate">{entry.target_id}</p>
                  </div>
                </div>
                {entry.reason && (
                  <p className="text-gray-400 text-sm mt-2 truncate">{entry.reason}</p>
                )}
              </div>
              {canRemove && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setDeleteTarget(entry)}
                  className="text-red-400 hover:text-red-300 hover:bg-red-900/30 transition-all ml-2"
                  title={`Remove ${entryName(entry)} from blacklist`}
                >
                  <FontAwesomeIcon icon="trash" aria-hidden="true" />
                  <span className="sr-only">Remove {entryName(entry)} from blacklist</span>
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>

      {filteredEntries.length === 0 && (
        <p className="text-gray-400 text-center py-8">
          {searchQuery
            ? `No entries found matching "${searchQuery}".`
            : "No blacklisted entries found."}
        </p>
      )}

      {canRemove && (
        <ConfirmModal
          isOpen={deleteTarget !== null}
          title="Remove from Blacklist"
          message={`Are you sure you want to remove ${deleteTarget ? entryName(deleteTarget) : "this entry"} from the ${copy.title.toLowerCase()}?`}
          confirmText="Remove"
          confirmVariant="danger"
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
