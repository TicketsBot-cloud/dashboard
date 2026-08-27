import type { User, Guild } from "@/types";

/**
 * Validate user data structure
 */
export const validateUser = (data: unknown): data is User => {
  if (!data || typeof data !== "object") return false;
  const user = data as Record<string, unknown>;

  return (
    typeof user.id === "string" &&
    typeof user.username === "string" &&
    typeof user.avatar === "string" &&
    typeof user.admin_tier === "string"
  );
};

/**
 * Validate guild data structure
 */
const validateGuild = (data: unknown): data is Guild => {
  if (!data || typeof data !== "object") return false;
  const guild = data as Record<string, unknown>;

  return (
    typeof guild.id === "string" &&
    typeof guild.name === "string" &&
    typeof guild.permission_level === "number" &&
    (guild.icon === undefined || typeof guild.icon === "string") &&
    (guild.premium === undefined || typeof guild.premium === "boolean")
  );
};

/**
 * Validate array of guilds
 */
export const validateGuilds = (data: unknown): Guild[] => {
  if (!Array.isArray(data)) return [];
  return data.filter(validateGuild);
};
