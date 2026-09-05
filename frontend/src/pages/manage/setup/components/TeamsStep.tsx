import { useState, type FC, type KeyboardEvent } from "react";
import { apiClient } from "@/lib/api";
import { toast } from "sonner";
import TextInput from "@/components/TextInput";
import Button from "@/components/Button";
import MultiSelect from "@/components/MultiSelect";
import { roleColour } from "@/lib/colour";

interface TeamsStepProps {
  guildId: string;
  roles: Array<{ id: string; name: string; color: number }>;
  existingTeams: Array<{ id: number; name: string }>;
  onTeamsChange: (teams: Array<{ id: number; name: string }>) => void;
}

interface TeamCard {
  id: number;
  name: string;
  roleIds: string[];
}

const TeamsStep: FC<TeamsStepProps> = ({ guildId, roles, existingTeams, onTeamsChange }) => {
  const [teams, setTeams] = useState<TeamCard[]>(existingTeams.map((t) => ({ ...t, roleIds: [] })));
  const [newTeamName, setNewTeamName] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const roleOptions = roles.map((r) => ({
    key: r.id,
    label: r.name,
    color: roleColour(r.color),
  }));

  const handleCreateTeam = async () => {
    const trimmed = newTeamName.trim();
    if (!trimmed) return;

    setIsCreating(true);
    try {
      const res = await apiClient.teams.create(guildId, trimmed);
      const team = res.data;
      const newTeams = [...teams, { id: team.id, name: team.name, roleIds: [] as string[] }];
      setTeams(newTeams);
      onTeamsChange(newTeams.map((t) => ({ id: t.id, name: t.name })));
      setNewTeamName("");
      toast.success("Team created");
    } catch {
      toast.error("Failed to create team");
    } finally {
      setIsCreating(false);
    }
  };

  const handleRolesChange = async (teamId: number, newRoleIds: string[]) => {
    const team = teams.find((t) => t.id === teamId);
    if (!team) return;

    const addedRoles = newRoleIds.filter((r) => !team.roleIds.includes(r));
    const removedRoles = team.roleIds.filter((r) => !newRoleIds.includes(r));

    for (const roleId of addedRoles) {
      try {
        await apiClient.teams.addMember(guildId, teamId.toString(), roleId, 1);
      } catch {
        toast.error("Failed to add role to team");
        return;
      }
    }

    for (const roleId of removedRoles) {
      try {
        await apiClient.teams.removeMember(guildId, teamId.toString(), roleId, 1);
      } catch {
        toast.error("Failed to remove role from team");
        return;
      }
    }

    setTeams((prev) => prev.map((t) => (t.id === teamId ? { ...t, roleIds: newRoleIds } : t)));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleCreateTeam();
    }
  };

  return (
    <div>
      {teams.length > 0 && (
        <div className="space-y-4 mb-6" role="list" aria-label="Created teams">
          {teams.map((team) => (
            <div key={team.id} className="rounded-lg bg-gray-800 p-4" role="listitem">
              <h3 className="text-sm font-medium text-white mb-3">{team.name}</h3>
              <MultiSelect
                label="Assign roles"
                value={team.roleIds}
                options={roleOptions}
                onChange={(ids) => handleRolesChange(team.id, ids)}
                placeholder="Select roles..."
              />
            </div>
          ))}
        </div>
      )}

      <div className="rounded-lg border border-dashed border-gray-600 p-4">
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <TextInput
              label="Team name"
              value={newTeamName}
              onChange={setNewTeamName}
              placeholder="e.g. Support, Billing, Moderators"
              maxLength={32}
              onKeyDown={handleKeyDown}
            />
          </div>
          <Button
            variant="primary"
            onClick={handleCreateTeam}
            disabled={!newTeamName.trim() || isCreating}
          >
            {isCreating ? "Creating..." : "Create Team"}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default TeamsStep;
