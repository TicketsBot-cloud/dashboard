import { useEffect, useRef, useState, type FC } from "react";
import { apiClient, SKIP_ERROR_TOAST } from "@/lib/api";
import { useParams } from "react-router";
import { getGuildById } from "@/stores/auth";
import { toast } from "sonner";
import { MainLayout } from "@/pages/layout/Main";
import { useGuildStore } from "@/stores/guild";
import Button from "@/components/Button";
import Select from "@/components/Select";
import { roleColour } from "@/lib/colour";
import ConfirmModal from "@/components/modals/ConfirmModal";
import ActionModal from "@/components/modal-primitives/ActionModal";
import UserSearchSelect, { type UserOption } from "@/components/UserSearchSelect";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBan, faTrash } from "@fortawesome/free-solid-svg-icons";
import ActionDropdown from "@/components/ActionDropdown";
import type { GuildRole } from "@/types";
import EmptyState from "@/components/EmptyState";
import Pagination from "@/components/Pagination";
import Table from "@/components/Table";
import TableSkeleton from "@/components/skeletons/TableSkeleton";
import FeatureLockBanner from "@/components/FeatureLockBanner";
import { useFeatureLock } from "@/hooks/useFeatureLock";
import { FEATURE_BLACKLIST } from "@/lib/feature-flags";
import { useApiErrorHandler } from "@/hooks/useApiErrorHandler";

interface BlacklistedUser {
  id: string;
  username: string;
}

interface BlacklistData {
  page_limit: number;
  total_pages: number;
  total_count: number;
  users: BlacklistedUser[];
  roles: string[];
}

const BlacklistPage: FC = () => {
  let { guildId } = useParams();
  guildId = guildId!;

  const { selectGuild, selectedGuild } = useGuildStore();

  const [data, setData] = useState<BlacklistData | null>(null);
  const [roles, setRoles] = useState<GuildRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  // Add user modal state
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserOption | null>(null);

  // Add role modal state
  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [selectedRoleId, setSelectedRoleId] = useState("");

  // Confirm removal modal
  const [removeModal, setRemoveModal] = useState<{
    isOpen: boolean;
    type: "user" | "role";
    id: string;
    name: string;
  } | null>(null);

  const { locked: polledLock } = useFeatureLock(FEATURE_BLACKLIST, guildId);
  const [forcedLock, setForcedLock] = useState(false);
  const handleApiError = useApiErrorHandler(
    "Blacklist management is temporarily unavailable. Please try again shortly.",
    setForcedLock,
  );
  const isLocked = forcedLock || polledLock === true;

  // This page is a long-lived list rather than a form the user navigates away
  // from after one submit (unlike panels create/edit), so a forced lock from a
  // 503 must release once the poll confirms the flag is back on, otherwise the
  // page stays locked forever after a single incident even though the flag was
  // re-enabled.
  useEffect(() => {
    if (polledLock === false) {
      setForcedLock(false);
    }
  }, [polledLock]);

  // Announce the lock lifting mid-session (e.g. a flag re-enabled while this page
  // is open). The banner's own aria-live region only reliably announces the
  // unlocked-to-locked transition (see FeatureLockBanner), so the reverse gets a
  // toast instead. Guarded so it never fires on mount, only on a genuine flip.
  const previousLockRef = useRef(isLocked);
  useEffect(() => {
    if (previousLockRef.current && !isLocked) {
      toast.success("Blacklist changes are available again.");
    }
    previousLockRef.current = isLocked;
  }, [isLocked]);

  useEffect(() => {
    const guild = getGuildById(guildId);
    if (guild) {
      if (!selectedGuild || selectedGuild.id !== guild.id) {
        selectGuild(guild);
      }

      if (guild.permission_level < 1) {
        toast.warning(
          "You do not have permission to manage this server's blacklist. Please contact an administrator.",
        );
      }
    }
  }, [guildId, selectGuild, selectedGuild]);

  const loadData = async (p: number) => {
    try {
      const res = await apiClient.blacklist.getByGuild(guildId, p);
      setData(res.data);
    } catch (error) {
      console.error("Failed to load blacklist:", error);
    }
  };

  const loadRoles = async () => {
    try {
      const res = await apiClient.guilds.getRoles(guildId);
      setRoles(res.data.roles);
    } catch (error) {
      console.error("Failed to load roles:", error);
    }
  };

  useEffect(() => {
    setLoading(true);
    Promise.all([loadData(1), loadRoles()]).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guildId]);

  const goToPage = (newPage: number) => {
    setPage(newPage);
    loadData(newPage);
  };

  const loadUserOptions = async (query: string): Promise<UserOption[]> => {
    try {
      const res = await apiClient.guilds.searchMembers(guildId, query);
      return res.data.map(({ user }) => user);
    } catch {
      return [];
    }
  };

  const addUser = async () => {
    if (!selectedUser) return;

    try {
      const res = await apiClient.blacklist.add(guildId, 0, selectedUser.id, SKIP_ERROR_TOAST);

      if (res.data.resolved) {
        toast.success(`${res.data.username} has been blacklisted`);
      } else {
        toast.success(`User with ID ${res.data.id} has been blacklisted`);
      }

      setData((prev) =>
        prev
          ? {
              ...prev,
              users: [
                ...prev.users,
                {
                  id: res.data.id,
                  username: res.data.resolved ? res.data.username : "Unknown",
                },
              ],
            }
          : prev,
      );

      setSelectedUser(null);
      setUserModalOpen(false);
    } catch (error) {
      handleApiError(error, "Failed to blacklist user. Please try again.");
      console.error("Failed to blacklist user:", error);
    }
  };

  const addRole = async () => {
    if (!selectedRoleId) return;

    const role = roles.find((r) => r.id === selectedRoleId);
    if (!role) return;

    try {
      await apiClient.blacklist.add(guildId, 1, selectedRoleId, SKIP_ERROR_TOAST);

      toast.success(`${role.name} has been blacklisted`);

      setData((prev) => (prev ? { ...prev, roles: [...prev.roles, selectedRoleId] } : prev));

      setSelectedRoleId("");
      setRoleModalOpen(false);
    } catch (error) {
      handleApiError(error, "Failed to blacklist role. Please try again.");
      console.error("Failed to blacklist role:", error);
    }
  };

  const removeUser = async (user: BlacklistedUser) => {
    try {
      await apiClient.blacklist.removeUser(guildId, user.id, SKIP_ERROR_TOAST);
      toast.success(
        `${user.username !== "" ? user.username : `User with ID ${user.id}`} has been removed from the blacklist`,
      );
      setData((prev) =>
        prev ? { ...prev, users: prev.users.filter((u) => u.id !== user.id) } : prev,
      );
    } catch (error) {
      handleApiError(error, "Failed to remove user from the blacklist. Please try again.");
      console.error("Failed to remove user from blacklist:", error);
    }
  };

  const removeRole = async (roleId: string) => {
    const role = roles.find((r) => r.id === roleId);
    try {
      await apiClient.blacklist.removeRole(guildId, roleId, SKIP_ERROR_TOAST);
      toast.success(
        `${role ? role.name : `Role with ID ${roleId}`} has been removed from the blacklist`,
      );
      setData((prev) =>
        prev ? { ...prev, roles: prev.roles.filter((id) => id !== roleId) } : prev,
      );
    } catch (error) {
      handleApiError(error, "Failed to remove role from the blacklist. Please try again.");
      console.error("Failed to remove role from blacklist:", error);
    }
  };

  const handleRemoveConfirm = async () => {
    if (!removeModal) return;

    if (removeModal.type === "user") {
      const user = data?.users.find((u) => u.id === removeModal.id);
      if (user) await removeUser(user);
    } else {
      await removeRole(removeModal.id);
    }
    setRemoveModal(null);
  };

  const roleOptions = roles.map((role) => ({
    key: role.id,
    label: role.name,
    color: roleColour(role.color),
  }));

  const getRoleName = (roleId: string) => {
    const role = roles.find((r) => r.id === roleId);
    return role ? role.name : `Unknown (${roleId})`;
  };

  if (loading) {
    return (
      <MainLayout
        title={`Blacklist for ${selectedGuild?.name || "loading..."}`}
        subtitle="Manage blacklisted users and roles who cannot open tickets"
      >
        <FeatureLockBanner
          id="blacklist-lock-banner"
          locked={isLocked}
          featureLabel="Blacklist changes"
          existingLabel="blacklist entries"
        />
        <TableSkeleton rows={4} columns={2} />
      </MainLayout>
    );
  }

  return (
    <MainLayout
      title={`Blacklist for ${selectedGuild?.name || "loading..."}`}
      subtitle="Manage blacklisted users and roles who cannot open tickets"
    >
      <FeatureLockBanner
        id="blacklist-lock-banner"
        locked={isLocked}
        featureLabel="Blacklist changes"
        existingLabel="blacklist entries"
      />
      <div className="space-y-8">
        {/* Actions */}
        <div className="bg-gray-800 rounded-xl overflow-hidden">
          <div className="p-4">
            <h2 className="text-2xl font-bold mb-4">Blacklist</h2>
            <div className="flex gap-4 flex-wrap">
              <Button
                variant="primary"
                visuallyDisabled={isLocked}
                aria-describedby={isLocked ? "blacklist-lock-banner" : undefined}
                onClick={() => setUserModalOpen(true)}
              >
                <FontAwesomeIcon icon={faBan} className="mr-2" />
                Blacklist User
              </Button>
              <Button
                variant="primary"
                visuallyDisabled={isLocked}
                aria-describedby={isLocked ? "blacklist-lock-banner" : undefined}
                onClick={() => setRoleModalOpen(true)}
              >
                <FontAwesomeIcon icon={faBan} className="mr-2" />
                Blacklist Role
              </Button>
            </div>
          </div>
        </div>

        {/* Blacklisted Roles Table */}
        <div className="bg-gray-800 rounded-xl overflow-hidden">
          <div className="p-4">
            <h2 className="text-2xl font-bold mb-4">Blacklisted Roles</h2>
            {!data || data.roles.length === 0 ? (
              <EmptyState
                icon={faBan}
                title="No blacklisted roles"
                description="Blacklisted roles cannot open tickets in your server."
              />
            ) : (
              <Table>
                <Table.Head>
                  <Table.Row>
                    <Table.HeaderCell>Role</Table.HeaderCell>
                    <Table.HeaderCell className="text-right px-3 sm:px-6 py-3">
                      Action
                    </Table.HeaderCell>
                  </Table.Row>
                </Table.Head>
                <Table.Body>
                  {data.roles.map((roleId) => (
                    <Table.Row key={roleId}>
                      <Table.Cell>{getRoleName(roleId)}</Table.Cell>
                      <Table.Cell className="px-3 sm:px-6 py-4 flex justify-end">
                        <ActionDropdown
                          items={[
                            {
                              label: "Remove",
                              icon: faTrash,
                              variant: "danger",
                              // The sole item in this menu: a disabled-but-rendered
                              // trigger would open a floating panel with nothing
                              // focusable inside it, so hide the trigger entirely
                              // while locked instead (see tags/_index.tsx EmptyState
                              // for the same reasoning applied to a different control).
                              hidden: isLocked,
                              onClick: () =>
                                setRemoveModal({
                                  isOpen: true,
                                  type: "role",
                                  id: roleId,
                                  name: getRoleName(roleId),
                                }),
                            },
                          ]}
                        />
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table>
            )}
          </div>
        </div>

        {/* Blacklisted Users Table */}
        <div className="bg-gray-800 rounded-xl overflow-hidden">
          <div className="p-4">
            <h2 className="text-2xl font-bold mb-4">Blacklisted Users</h2>
            {!data || data.users.length === 0 ? (
              <EmptyState
                icon={faBan}
                title="No blacklisted users"
                description="Blacklisted users cannot open tickets in your server."
              />
            ) : (
              <Table>
                <Table.Head>
                  <Table.Row>
                    <Table.HeaderCell>User</Table.HeaderCell>
                    <Table.HeaderCell className="text-right px-3 sm:px-6 py-3">
                      Action
                    </Table.HeaderCell>
                  </Table.Row>
                </Table.Head>
                <Table.Body>
                  {data.users.map((user) => (
                    <Table.Row key={user.id}>
                      <Table.Cell>
                        {user.username && user.username !== ""
                          ? `${user.username} (${user.id})`
                          : `Unknown (${user.id})`}
                      </Table.Cell>
                      <Table.Cell className="px-3 sm:px-6 py-4 flex justify-end">
                        <ActionDropdown
                          items={[
                            {
                              label: "Remove",
                              icon: faTrash,
                              variant: "danger",
                              // The sole item in this menu: a disabled-but-rendered
                              // trigger would open a floating panel with nothing
                              // focusable inside it, so hide the trigger entirely
                              // while locked instead (see tags/_index.tsx EmptyState
                              // for the same reasoning applied to a different control).
                              hidden: isLocked,
                              onClick: () =>
                                setRemoveModal({
                                  isOpen: true,
                                  type: "user",
                                  id: user.id,
                                  name:
                                    user.username && user.username !== ""
                                      ? user.username
                                      : `User ${user.id}`,
                                }),
                            },
                          ]}
                        />
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table>
            )}

            {/* Pagination */}
            <Pagination
              variant="full"
              page={page}
              totalPages={data?.total_pages ?? 1}
              onChange={goToPage}
            />
          </div>
        </div>
      </div>

      {/* Blacklist User Modal */}
      <ActionModal
        isOpen={userModalOpen}
        onClose={() => {
          setUserModalOpen(false);
          setSelectedUser(null);
        }}
      >
        <div className="p-6">
          <h3 className="text-xl font-bold mb-4">Blacklist User</h3>

          <UserSearchSelect
            value={selectedUser}
            onChange={setSelectedUser}
            loadOptions={loadUserOptions}
            label="User"
            allowRawId
          />

          <div className="flex justify-end gap-3 mt-6">
            <Button
              variant="secondary"
              onClick={() => {
                setUserModalOpen(false);
                setSelectedUser(null);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="success"
              onClick={addUser}
              disabled={!selectedUser}
              visuallyDisabled={isLocked}
              aria-describedby={isLocked ? "blacklist-lock-banner" : undefined}
            >
              Confirm
            </Button>
          </div>
        </div>
      </ActionModal>

      {/* Blacklist Role Modal */}
      <ActionModal
        isOpen={roleModalOpen}
        onClose={() => {
          setRoleModalOpen(false);
          setSelectedRoleId("");
        }}
      >
        <div className="p-6">
          <h3 className="text-xl font-bold mb-4">Blacklist Role</h3>

          <Select
            value={selectedRoleId}
            onChange={(v) => setSelectedRoleId(v ?? "")}
            options={roleOptions}
            label="Role"
            placeholder="Select a role..."
          />

          <div className="flex justify-end gap-3 mt-6">
            <Button
              variant="secondary"
              onClick={() => {
                setRoleModalOpen(false);
                setSelectedRoleId("");
              }}
            >
              Cancel
            </Button>
            <Button
              variant="success"
              onClick={addRole}
              disabled={!selectedRoleId}
              visuallyDisabled={isLocked}
              aria-describedby={isLocked ? "blacklist-lock-banner" : undefined}
            >
              Confirm
            </Button>
          </div>
        </div>
      </ActionModal>

      {/* Remove Confirmation Modal */}
      <ConfirmModal
        isOpen={!!removeModal}
        title="Confirm Removal"
        message={`Are you sure you want to remove "${removeModal?.name}" from the blacklist?`}
        confirmText="Remove"
        cancelText="Cancel"
        confirmVariant="danger"
        onConfirm={handleRemoveConfirm}
        onCancel={() => setRemoveModal(null)}
      />
    </MainLayout>
  );
};

export default BlacklistPage;
