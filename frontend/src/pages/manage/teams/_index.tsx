import { useCallback, useEffect, useRef, useState, type FC, type FormEvent } from "react";
import { apiClient, SKIP_ERROR_TOAST } from "@/lib/api";
import { useParams, useSearchParams } from "react-router";
import { getGuildById } from "@/stores/auth";
import { toast } from "sonner";
import { MainLayout } from "@/pages/layout/Main";
import { useGuildStore } from "@/stores/guild";
import Button from "@/components/Button";
import Select from "@/components/Select";
import TextInput from "@/components/TextInput";
import Slider from "@/components/Slider";
import ConfirmModal from "@/components/modals/ConfirmModal";
import FeatureLockBanner from "@/components/FeatureLockBanner";
import { useFeatureLock } from "@/hooks/useFeatureLock";
import { FEATURE_TEAMS } from "@/lib/feature-flags";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPaperPlane, faPeopleGroup, faPlus, faTrash } from "@fortawesome/free-solid-svg-icons";
import ActionDropdown from "@/components/ActionDropdown";
import EmptyState from "@/components/EmptyState";
import Table from "@/components/Table";
import TableSkeleton from "@/components/skeletons/TableSkeleton";
import type { Team, GuildRole } from "@/types";
import { useApiErrorHandler } from "@/hooks/useApiErrorHandler";

const USER_TYPE = 0;
const ROLE_TYPE = 1;

const TEAM_PERMISSION_LABELS = {
  add_reactions: "Add Reactions",
  send_messages: "Send Messages",
  send_tts_messages: "Send Text-to-speech Messages",
  embed_links: "Embed Links",
  attach_files: "Attach Files",
  mention_everyone: "Mention @everyone, @here and All Roles",
  use_external_emojis: "Use External Emojis",
  use_application_commands: "Use Application Commands",
  use_external_stickers: "Use External Stickers",
  send_voice_messages: "Send Voice Messages",
} as const;

interface TeamMember {
  id: string;
  type: number;
  name: string;
}

const TeamsPage: FC = () => {
  let { guildId } = useParams();
  guildId = guildId!;

  const { selectGuild, selectedGuild } = useGuildStore();

  useEffect(() => {
    const guild = getGuildById(guildId);
    if (guild) {
      if (!selectedGuild || selectedGuild.id !== guild.id) {
        selectGuild(guild);
      }

      if (guild.permission_level < 2) {
        toast.warning(
          "You do not have permission to manage this server's teams. Please contact an administrator.",
        );
      }
    }
  }, [guildId, selectGuild, selectedGuild]);

  useEffect(() => {
    if (selectedGuild?.roles) {
      setRoles(selectedGuild.roles);
    }
  }, [selectedGuild?.roles]);

  const { locked: polledLock } = useFeatureLock(FEATURE_TEAMS, guildId);
  const [forcedLock, setForcedLock] = useState(false);
  const isLocked = forcedLock || polledLock === true;

  // This page is a long-lived list rather than a form the user navigates away
  // from after one submit, so a forced lock from a 503 must release once the
  // poll confirms the flag is back on, otherwise the page stays locked forever
  // after a single incident even though the flag was re-enabled.
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
      toast.success("Team changes are available again.");
    }
    previousLockRef.current = isLocked;
  }, [isLocked]);

  // Stable identity: flushPendingPermissionsSave lists this in its dep array.
  const handleTeamMutationError = useApiErrorHandler(
    "Team management is temporarily unavailable. Please try again shortly.",
    setForcedLock,
  );

  const [searchParams, setSearchParams] = useSearchParams();

  const defaultTeam: Team = { id: 0, name: "Default" };
  const [loading, setLoading] = useState(true);
  const [createName, setCreateName] = useState("");
  const [teams, setTeams] = useState<Team[]>([defaultTeam]);
  const [roles, setRoles] = useState<GuildRole[]>([]);
  const [activeTeamId, setActiveTeamId] = useState<string>("0");
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [selectedRole, setSelectedRole] = useState<string>("");
  const [deleteModal, setDeleteModal] = useState<{
    isOpen: boolean;
    type: "team" | "member";
    id: string;
    name: string;
    member?: TeamMember;
  } | null>(null);

  interface TeamPermissions {
    add_reactions: boolean;
    send_messages: boolean;
    send_tts_messages: boolean;
    embed_links: boolean;
    attach_files: boolean;
    mention_everyone: boolean;
    use_external_emojis: boolean;
    use_application_commands: boolean;
    use_external_stickers: boolean;
    send_voice_messages: boolean;
  }

  const defaultPermissions: TeamPermissions = {
    add_reactions: true,
    send_messages: true,
    send_tts_messages: true,
    embed_links: true,
    attach_files: true,
    mention_everyone: false,
    use_external_emojis: true,
    use_application_commands: true,
    use_external_stickers: true,
    send_voice_messages: true,
  };

  const [teamPermissions, setTeamPermissions] = useState<TeamPermissions>(defaultPermissions);
  const [loadingPermissions, setLoadingPermissions] = useState(false);

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPermissionsSaveRef = useRef<{ teamId: string; perms: TeamPermissions } | null>(null);

  const flushPendingPermissionsSave = useCallback(async () => {
    const pending = pendingPermissionsSaveRef.current;
    if (!pending || pending.teamId === "default" || pending.teamId === "0") {
      pendingPermissionsSaveRef.current = null;
      return;
    }

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }

    pendingPermissionsSaveRef.current = null;
    try {
      await apiClient.teams.updatePermissions(
        guildId,
        pending.teamId,
        pending.perms,
        SKIP_ERROR_TOAST,
      );
    } catch (error) {
      console.error("Failed to save team permissions:", error);
      handleTeamMutationError(error, "Failed to save team permissions. Please try again.");

      // The optimistic toggle was never persisted: resync from the server rather
      // than leaving the sliders showing a value that doesn't match what's saved.
      try {
        const res = await apiClient.teams.getPermissions(guildId, pending.teamId);
        setTeamPermissions(res.data);
      } catch (resyncError) {
        console.error("Failed to resync team permissions after failed save:", resyncError);
      }
    }
  }, [guildId, handleTeamMutationError]);

  const schedulePermissionsSave = useCallback(
    (updated: TeamPermissions, teamId: string) => {
      if (teamId === "default" || teamId === "0" || loadingPermissions) return;

      pendingPermissionsSaveRef.current = { teamId, perms: updated };
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      saveTimeoutRef.current = setTimeout(() => {
        void flushPendingPermissionsSave();
      }, 500);
    },
    [flushPendingPermissionsSave, loadingPermissions],
  );

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      void flushPendingPermissionsSave();
    };
  }, [flushPendingPermissionsSave]);

  const loadTeamPermissions = async (teamId: string) => {
    setLoadingPermissions(true);
    setTeamPermissions(defaultPermissions);

    if (teamId === "default" || teamId === "0") {
      setLoadingPermissions(false);
      return;
    }

    try {
      const res = await apiClient.teams.getPermissions(guildId, teamId);
      setTeamPermissions(res.data);
    } catch (error) {
      console.error("Failed to load team permissions:", error);
    }
    setLoadingPermissions(false);
  };

  const togglePermission = (key: keyof TeamPermissions) => {
    const updated = { ...teamPermissions, [key]: !teamPermissions[key] };
    setTeamPermissions(updated);
    schedulePermissionsSave(updated, activeTeamId);
  };

  const getTeam = (id: string) => {
    return teams.find((team) => team.id.toString() === id);
  };

  const updateActiveTeam = async (teamId: string) => {
    try {
      await flushPendingPermissionsSave();

      if (teamId == "0") {
        teamId = "default";
      }
      const res = await apiClient.teams.getMembers(guildId, teamId);
      setMembers(res.data);
      setActiveTeamId(teamId);
      await loadTeamPermissions(teamId);
    } catch (error) {
      console.error("Failed to load team members:", error);
    }
  };

  const addRole = async () => {
    if (!selectedRole || isLocked) return;

    try {
      const role = roles.find((r) => r.id === selectedRole);
      if (!role) return;

      await apiClient.teams.addMember(guildId, activeTeamId, selectedRole, 1, SKIP_ERROR_TOAST);
      toast.success(
        `${role.name} has been added to the support team ${getTeam(activeTeamId)?.name}`,
      );

      const entity: TeamMember = {
        id: selectedRole,
        type: ROLE_TYPE,
        name: role.name,
      };
      setMembers([...members, entity]);
      setSelectedRole("");
    } catch (error) {
      console.error("Failed to add role to team:", error);
      handleTeamMutationError(error, "Failed to add role to team. Please try again.");
    }
  };

  const removeMember = async (teamId: string, entity: TeamMember) => {
    try {
      await apiClient.teams.removeMember(guildId, teamId, entity.id, entity.type, SKIP_ERROR_TOAST);
      setMembers((prev) => prev.filter((member) => member.id !== entity.id));

      if (entity.type === USER_TYPE) {
        toast.success(`${entity.name} has been removed from the team`);
      } else {
        const role = roles.find((r) => r.id === entity.id);
        toast.success(`${role ? role.name : "Unknown role"} has been removed from the team`);
      }
    } catch (error) {
      console.error("Failed to remove member from team:", error);
      handleTeamMutationError(error, "Failed to remove member from team. Please try again.");
    }
  };

  const createTeam = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!createName.trim() || isLocked) return;

    try {
      const res = await apiClient.teams.create(guildId, createName, SKIP_ERROR_TOAST);
      toast.success(`Team ${createName} has been created`);
      setCreateName("");
      setTeams([...teams, res.data]);
    } catch (error) {
      console.error("Failed to create team:", error);
      handleTeamMutationError(error, "Failed to create team. Please try again.");
    }
  };

  const deleteTeam = async (id: string) => {
    try {
      await apiClient.teams.delete(guildId, id, SKIP_ERROR_TOAST);
      toast.success("Team deleted successfully");
      setActiveTeamId("0");
      setTeams((prev) => prev.filter((team) => team.id.toString() !== id));
      await updateActiveTeam("0");
    } catch (error) {
      console.error("Failed to delete team:", error);
      handleTeamMutationError(error, "Failed to delete team. Please try again.");
    }
  };

  const handleDelete = async () => {
    if (!deleteModal) return;

    // A modal opened before the lock took effect (e.g. the 60s poll flips it
    // while the confirmation is still open) must not reach the mutation.
    if (isLocked) {
      toast.warning("Team management is temporarily unavailable. Please try again shortly.");
      setDeleteModal(null);
      return;
    }

    if (deleteModal.type === "team") {
      await deleteTeam(deleteModal.id);
    } else if (deleteModal.member) {
      await removeMember(activeTeamId, deleteModal.member);
    }
    setDeleteModal(null);
  };

  useEffect(() => {
    const loadTeams = async () => {
      try {
        const res = await apiClient.teams.getByGuild(guildId);
        setTeams([defaultTeam, ...res.data]);
      } catch (error) {
        console.error("Failed to load teams:", error);
      }
    };

    const loadRoles = async () => {
      if (selectedGuild?.roles) {
        setRoles(selectedGuild.roles);
        return;
      }
      try {
        const res = await apiClient.guilds.getRoles(guildId);
        setRoles(res.data.roles);
      } catch (error) {
        console.error("Failed to load roles:", error);
      }
    };

    setLoading(true);
    Promise.all([loadTeams(), loadRoles()])
      .then(() => {
        const urlTeam = searchParams.get("team");
        return updateActiveTeam(urlTeam && urlTeam !== "0" ? urlTeam : "0");
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guildId]);

  useEffect(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (activeTeamId && activeTeamId !== "0" && activeTeamId !== "default") {
          next.set("team", activeTeamId);
        } else {
          next.delete("team");
        }
        return next;
      },
      { replace: true },
    );
  }, [activeTeamId, setSearchParams]);

  const roleOptions = roles.map((role) => ({
    key: role.id,
    label: role.name,
    color: `#${role.color.toString(16).padStart(6, "0")}`,
  }));

  const teamOptions = teams.map((team) => ({
    key: team.id == 0 ? "default" : team.id.toString(),
    label: team.name,
  }));

  if (loading) {
    return (
      <MainLayout
        title={`Support Teams for ${selectedGuild?.name || "loading..."}`}
        subtitle="Manage support teams and their members"
      >
        <FeatureLockBanner
          id="team-lock-banner"
          locked={isLocked}
          featureLabel="Team changes"
          existingLabel="teams"
        />
        <TableSkeleton rows={4} columns={3} />
      </MainLayout>
    );
  }

  return (
    <MainLayout
      title={`Support Teams for ${selectedGuild?.name || "loading..."}`}
      subtitle="Manage support teams and their members"
    >
      <FeatureLockBanner
        id="team-lock-banner"
        locked={isLocked}
        featureLabel="Team changes"
        existingLabel="teams"
      />
      <div className="space-y-8">
        {/* Create Team Section */}
        <div className="bg-gray-800 rounded-xl overflow-hidden">
          <div className="p-4">
            <h2 className="text-2xl font-bold mb-4">Create Team</h2>
            <form onSubmit={createTeam} className="flex gap-4 items-end">
              <div className="flex-1 max-w-md">
                <TextInput value={createName} onChange={setCreateName} placeholder="Team Name" />
              </div>
              <Button
                type="submit"
                variant="success"
                disabled={!createName.trim()}
                visuallyDisabled={isLocked}
                aria-describedby={isLocked ? "team-lock-banner" : undefined}
              >
                <FontAwesomeIcon icon={faPaperPlane} className="mr-2" />
                Submit
              </Button>
            </form>
          </div>
        </div>

        {/* Manage Teams Section */}
        <div className="bg-gray-800 rounded-xl overflow-hidden">
          <div className="p-4">
            <h2 className="text-2xl font-bold mb-4">Manage Teams</h2>

            <div className="flex gap-4 items-end mb-12">
              <div className="flex-1 max-w-md">
                <Select
                  value={activeTeamId}
                  onChange={(value) => updateActiveTeam(value ?? "")}
                  options={teamOptions}
                  label="Team"
                />
              </div>
              {activeTeamId !== "0" && (
                <Button
                  variant="danger"
                  visuallyDisabled={isLocked}
                  aria-describedby={isLocked ? "team-lock-banner" : undefined}
                  onClick={() =>
                    setDeleteModal({
                      isOpen: true,
                      type: "team",
                      id: activeTeamId,
                      name: getTeam(activeTeamId)?.name || "Unknown",
                    })
                  }
                >
                  Delete {getTeam(activeTeamId)?.name}
                </Button>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Manage Members Column */}
              <div>
                <h3 className="text-xl font-semibold mb-4 text-center">Manage Members</h3>
                <Table>
                  <Table.Body>
                    {members.length === 0 ? (
                      <Table.Row className="">
                        <Table.Cell colSpan={3} className="p-0">
                          <EmptyState
                            icon={faPeopleGroup}
                            title="No members yet"
                            description="Add a role or user to this team to get started."
                          />
                        </Table.Cell>
                      </Table.Row>
                    ) : (
                      members.map((member) => (
                        <Table.Row key={`${member.type}-${member.id}`}>
                          <Table.Cell>
                            {member.type === USER_TYPE ? (
                              member.name
                            ) : (
                              <>
                                {roles.find((role) => role.id === member.id)?.name ||
                                  "Unknown Role"}
                              </>
                            )}
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
                                    setDeleteModal({
                                      isOpen: true,
                                      type: "member",
                                      id: member.id,
                                      name:
                                        member.type === USER_TYPE
                                          ? member.name
                                          : roles.find((r) => r.id === member.id)?.name ||
                                            "Unknown",
                                      member,
                                    }),
                                },
                              ]}
                            />
                          </Table.Cell>
                        </Table.Row>
                      ))
                    )}
                  </Table.Body>
                </Table>
              </div>

              {/* Add Role Column */}
              <div>
                <h3 className="text-xl font-semibold mb-4 text-center">Add Role</h3>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <Select
                      value={selectedRole}
                      onChange={(v) => setSelectedRole(v ?? "")}
                      options={roleOptions}
                      placeholder="Select a role..."
                    />
                  </div>
                  <Button
                    variant="success"
                    onClick={addRole}
                    disabled={!selectedRole}
                    visuallyDisabled={isLocked}
                    aria-describedby={isLocked ? "team-lock-banner" : undefined}
                  >
                    <FontAwesomeIcon icon={faPlus} className="mr-2" />
                    Add To Team
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Team Permissions Section */}
        {activeTeamId !== "default" && activeTeamId !== "0" && (
          <div className="bg-gray-800 rounded-xl overflow-hidden">
            <div className="p-4">
              <h2 className="text-2xl font-bold mb-2">Team Permissions</h2>
              <p className="text-gray-400 text-sm mb-4">
                Ticket admins and support reps always have full permissions regardless of these
                settings.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {(Object.entries(TEAM_PERMISSION_LABELS) as [keyof TeamPermissions, string][]).map(
                  ([key, label]) => (
                    <Slider
                      key={key}
                      label={label}
                      value={teamPermissions[key]}
                      onChange={() => togglePermission(key)}
                      disabled={loadingPermissions || isLocked}
                      ariaDescribedBy={isLocked ? "team-lock-banner" : undefined}
                    />
                  ),
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <ConfirmModal
        isOpen={!!deleteModal}
        title="Confirm Deletion"
        message={
          deleteModal?.type === "team"
            ? `Are you sure you want to delete the team "${deleteModal?.name}"? This action cannot be undone.`
            : `Are you sure you want to remove "${deleteModal?.name}" from the team? This action cannot be undone.`
        }
        confirmText="Delete"
        cancelText="Cancel"
        confirmVariant="danger"
        onConfirm={handleDelete}
        onCancel={() => setDeleteModal(null)}
      />
    </MainLayout>
  );
};

export default TeamsPage;
