import type { FC } from "react";
import type { ACL, GuildRole } from "@/types";
import Button from "@/components/Button";
import Select from "@/components/Select";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowUp, faArrowDown, faXmark } from "@fortawesome/free-solid-svg-icons";

interface AccessControlListEditorProps {
  guildId: string;
  roles: GuildRole[];
  acl: ACL[];
  onChange: (acl: ACL[]) => void;
}

const MAX_ACL_SIZE = 10;

const AccessControlListEditor: FC<AccessControlListEditorProps> = ({
  guildId,
  roles,
  acl,
  onChange,
}) => {
  const availableRoles = roles.filter((r) => !acl.find((s) => s.role_id === r.id));

  const addRole = (roleId: string | null) => {
    if (!roleId) return;
    onChange([{ role_id: roleId, action: "allow" }, ...acl]);
  };

  const removeRole = (roleId: string) => {
    if (roleId === guildId) return;
    onChange(acl.filter((s) => s.role_id !== roleId));
  };

  const toggleAction = (roleId: string) => {
    onChange(
      acl.map((s) =>
        s.role_id === roleId ? { ...s, action: s.action === "allow" ? "deny" : "allow" } : s,
      ),
    );
  };

  const moveUp = (index: number) => {
    if (index <= 0) return;
    const next = [...acl];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    onChange(next);
  };

  const moveDown = (index: number) => {
    if (index >= acl.length - 1) return;
    const next = [...acl];
    [next[index], next[index + 1]] = [next[index + 1], next[index]];
    onChange(next);
  };

  const getRoleName = (roleId: string) => {
    if (roleId === guildId) return "@everyone";
    const role = roles.find((r) => r.id === roleId);
    return role ? role.name : "Deleted Role";
  };

  return (
    <div className="flex flex-col gap-3">
      <Select
        label="Add Role"
        placeholder="Add another role..."
        options={availableRoles.map((r) => ({ key: r.id, label: r.name }))}
        value=""
        onChange={addRole}
        disabled={acl.length >= MAX_ACL_SIZE}
      />

      <div className="flex flex-col gap-1 p-3 rounded bg-gray-900">
        {acl.map((subject, i) => (
          <div
            key={subject.role_id}
            className="flex items-center justify-between px-4 py-2 rounded bg-gray-700"
          >
            <div className="flex items-center gap-4 flex-1">
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  title="Move up"
                  onClick={() => moveUp(i)}
                  disabled={i <= 0}
                  className="text-gray-300 hover:text-white disabled:text-gray-600 disabled:cursor-default"
                >
                  <FontAwesomeIcon icon={faArrowUp} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  title="Move down"
                  onClick={() => moveDown(i)}
                  disabled={i >= acl.length - 1}
                  className="text-gray-300 hover:text-white disabled:text-gray-600 disabled:cursor-default"
                >
                  <FontAwesomeIcon icon={faArrowDown} />
                </Button>
              </div>
              <span className="text-white">{getRoleName(subject.role_id)}</span>
              <div className="flex gap-1">
                <Button
                  variant={subject.action === "allow" ? "success" : "danger"}
                  size="sm"
                  onClick={() => toggleAction(subject.role_id)}
                  className="font-medium"
                >
                  {subject.action === "allow" ? "Allow" : "Deny"}
                </Button>
              </div>
            </div>
            {subject.role_id !== guildId && (
              <Button
                variant="ghost"
                size="icon"
                title="Remove role"
                onClick={() => removeRole(subject.role_id)}
                className="text-gray-400 hover:text-red-400"
              >
                <FontAwesomeIcon icon={faXmark} />
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default AccessControlListEditor;
