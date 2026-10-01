import { BOT_ID } from "@/lib/constants";

const INVITE_PERMISSIONS = "395942816984";

/**
 * Discord OAuth2 bot invite URL. With a guildId, Discord preselects that server
 * and hides the picker so the user cannot add the bot somewhere else by mistake.
 */
export function buildInviteUrl(guildId?: string): string {
  const params = new URLSearchParams({
    client_id: BOT_ID,
    scope: "bot applications.commands",
    permissions: INVITE_PERMISSIONS,
  });
  if (guildId) {
    params.set("guild_id", guildId);
    params.set("disable_guild_select", "true");
  }
  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}
