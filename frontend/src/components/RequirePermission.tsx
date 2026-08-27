import { useContext, useEffect } from "react";
import { Navigate, useParams } from "react-router";
import { GuildContext } from "@/state/context";
import { getGuildById } from "@/stores/auth";
import { toast } from "sonner";

interface Props {
  level: number;
  children: React.ReactNode;
}

export default function RequirePermission({ level, children }: Props) {
  const { guildId } = useParams();
  const selectedGuild = useContext(GuildContext);
  const storedGuild = guildId ? getGuildById(guildId) : null;
  const guild =
    storedGuild ??
    (selectedGuild && selectedGuild.id.toString() === guildId ? selectedGuild : null);
  const userLevel = guild?.permission_level ?? 0;

  useEffect(() => {
    if (guild && userLevel < level) {
      toast.warning("You do not have permission to view this page.");
    }
  }, [guild, userLevel, level]);

  if (!guild) {
    return <Navigate to="/" replace />;
  }

  if (userLevel < level) {
    if (userLevel >= 1) {
      return <Navigate to={`/manage/${guildId}/tickets`} replace />;
    }
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
