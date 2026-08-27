import { useState, useEffect, useMemo, useCallback } from "react";
import { userAvatarUrl } from "@/lib/discord-cdn";
import ConfirmModal from "@/components/modals/ConfirmModal";
import Button from "@/components/Button";
import TextInput from "@/components/TextInput";
import SearchInput from "@/components/SearchInput";
import Select from "@/components/Select";
import ActionDropdown from "@/components/ActionDropdown";
import { faUserShield, faGlobe, faTrash } from "@fortawesome/free-solid-svg-icons";
import { apiClient } from "@/lib/api";
import { toast } from "sonner";
import type { BotStaffMember } from "@/types";
import TableSkeleton from "@/components/skeletons/TableSkeleton";
import { useUrlSearch } from "@/hooks/useUrlSearch";
import { matchesSearch } from "@/lib/search";
import { useAuthStore } from "@/stores/auth";
import { isAtLeast } from "@/lib/admin-tier";

const TIER_BADGE_STYLES: Record<string, string> = {
  owner: "bg-purple-600/20 text-purple-400",
  admin: "bg-blue-600/20 text-blue-400",
  helper: "bg-gray-600/20 text-gray-400",
};

const staffRank = (member: BotStaffMember): number => {
  if (member.tier === "owner") return 0;
  if (member.tier === "admin") return member.global_view ? 1 : 2;
  return 3;
};

export default function BotStaffPage() {
  const { user } = useAuthStore();
  const userTier = user?.admin_tier ?? "";
  const isOwner = isAtLeast(userTier, "owner");
  const isAdmin = isAtLeast(userTier, "admin");

  const [staffMembers, setStaffMembers] = useState<BotStaffMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newUserId, setNewUserId] = useState("");
  const [newTier, setNewTier] = useState<string>("helper");
  const { searchQuery, setSearchQuery, debouncedSearch } = useUrlSearch();
  const [deleteTarget, setDeleteTarget] = useState<BotStaffMember | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  // Tier options depend on the current user's tier
  const tierOptions = useMemo(() => {
    if (isOwner) {
      return [
        { key: "admin", label: "Admin" },
        { key: "helper", label: "Helper" },
      ];
    }
    // Admins can only add helpers
    return [{ key: "helper", label: "Helper" }];
  }, [isOwner]);

  const fetchStaff = useCallback(async () => {
    try {
      const res = await apiClient.admin.botStaff.list();
      setStaffMembers(res.data);
    } catch {
      // Error handled by interceptor
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStaff();
  }, [fetchStaff]);

  const filteredStaff = useMemo(
    () =>
      staffMembers
        .filter((m) => matchesSearch(debouncedSearch, m.username, m.id))
        .sort(
          (a, b) =>
            staffRank(a) - staffRank(b) ||
            a.username.localeCompare(b.username, undefined, { numeric: true, sensitivity: "base" }),
        ),
    [staffMembers, debouncedSearch],
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
      await apiClient.admin.botStaff.add(trimmed, newTier);
      toast.success("Bot staff member added successfully.");
      setNewUserId("");
      await fetchStaff();
    } catch {
      // Error handled by interceptor
    } finally {
      setIsAdding(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    try {
      await apiClient.admin.botStaff.remove(deleteTarget.id);
      toast.success("Bot staff member removed successfully.");
      setDeleteTarget(null);
      await fetchStaff();
    } catch {
      // Error handled by interceptor
    }
  };

  const handleUpdateTier = async (member: BotStaffMember, targetTier: "admin" | "helper") => {
    try {
      await apiClient.admin.botStaff.update(member.id, targetTier);
      toast.success(`${member.username} updated to ${targetTier}.`);
      await fetchStaff();
    } catch {
      // Error handled by interceptor
    }
  };

  const handleToggleGlobalView = async (member: BotStaffMember) => {
    const enabled = !member.global_view;
    try {
      await apiClient.admin.botStaff.setGlobalView(member.id, enabled);
      toast.success(
        enabled
          ? `Global view granted to ${member.username}.`
          : `Global view revoked from ${member.username}.`,
      );
      await fetchStaff();
    } catch {
      // Error handled by interceptor
    }
  };

  const canRemoveMember = (member: BotStaffMember): boolean => {
    if (member.id === user?.id) return false;
    if (isOwner) return true;
    if (isAdmin && member.tier === "helper") return true;
    return false;
  };

  const canChangeTier = (member: BotStaffMember): boolean => {
    if (member.tier === "owner") return false;
    // Only owners can change tiers
    if (!isOwner) return false;
    // Cannot change own tier
    if (member.id === user?.id) return false;
    return true;
  };

  const canToggleGlobalView = (member: BotStaffMember): boolean => {
    if (!isOwner) return false;
    if (member.id === user?.id) return false;
    return member.tier === "admin";
  };

  const getAvatarUrl = (member: BotStaffMember): string =>
    userAvatarUrl(member.id, member.avatar_url ?? null);

  if (isLoading) {
    return <TableSkeleton rows={4} columns={3} />;
  }

  return (
    <div>
      <header className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-semibold mb-2 text-center">Bot Staff</h1>
        <p className="text-center text-gray-400 text-sm sm:text-base">
          Manage admin and helper access
        </p>
      </header>

      {/* Add Staff Section */}
      {isAdmin && (
        <div className="bg-gray-800 rounded-xl p-4 sm:p-6 mb-6">
          <h2 className="text-lg font-medium mb-3">Add Bot Staff</h2>
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
            <div className="w-full sm:w-40">
              <Select
                value={newTier}
                options={tierOptions}
                onChange={(v) => setNewTier(v ?? "helper")}
                hideSearch
              />
            </div>
            <Button variant="success" onClick={handleAdd} disabled={isAdding || !newUserId.trim()}>
              {isAdding ? "Adding..." : "Add Staff"}
            </Button>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="flex justify-end mb-4">
        <SearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Search staff..."
          label="Search staff by username or ID"
          className="w-full sm:w-1/2 md:w-1/3 lg:w-1/4"
        />
      </div>

      {/* Staff Grid */}
      <div
        className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
        role="list"
        aria-label="Bot staff members"
      >
        {filteredStaff.map((member) => (
          <div
            key={member.id}
            role="listitem"
            className="group flex items-center space-x-4 bg-gray-800 p-4 rounded-lg hover:bg-gray-700 transition"
          >
            <div className="w-12 h-12 rounded-md overflow-hidden shrink-0">
              <img
                src={getAvatarUrl(member)}
                alt={`${member.username} avatar`}
                className="w-full h-full object-cover rounded-full"
              />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-medium truncate">{member.username}</h3>
                <span
                  className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium capitalize shrink-0 ${TIER_BADGE_STYLES[member.tier] ?? "bg-gray-600/20 text-gray-400"}`}
                >
                  {member.tier}
                </span>
                {member.global_view && (
                  <span className="inline-block text-xs px-2 py-0.5 rounded-full font-medium shrink-0 bg-amber-600/20 text-amber-400">
                    Global View
                  </span>
                )}
              </div>
              <p className="text-gray-400 text-sm font-mono truncate">{member.id}</p>
            </div>
            {(canChangeTier(member) || canToggleGlobalView(member) || canRemoveMember(member)) && (
              <ActionDropdown
                items={[
                  {
                    label: member.tier === "helper" ? "Promote to Admin" : "Demote to Helper",
                    icon: faUserShield,
                    onClick: () =>
                      handleUpdateTier(member, member.tier === "helper" ? "admin" : "helper"),
                    hidden: !canChangeTier(member),
                  },
                  {
                    label: member.global_view ? "Revoke Global View" : "Grant Global View",
                    icon: faGlobe,
                    onClick: () => handleToggleGlobalView(member),
                    hidden: !canToggleGlobalView(member),
                  },
                  {
                    label: "Remove",
                    icon: faTrash,
                    onClick: () => setDeleteTarget(member),
                    hidden: !canRemoveMember(member),
                  },
                ]}
              />
            )}
          </div>
        ))}
      </div>

      {filteredStaff.length === 0 && (
        <p className="text-gray-400 text-center py-8">
          {searchQuery ? `No bot staff found matching "${searchQuery}".` : "No bot staff found."}
        </p>
      )}

      <ConfirmModal
        isOpen={deleteTarget !== null}
        title="Remove Bot Staff"
        message={`Are you sure you want to remove ${deleteTarget?.username ?? "this user"} from bot staff?`}
        confirmText="Remove"
        confirmVariant="danger"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
