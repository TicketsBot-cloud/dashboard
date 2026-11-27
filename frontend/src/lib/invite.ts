import { BOT_ID, DISCORD_AUTHORIZE_URL, INVITE_PERMISSIONS } from "@/lib/constants";

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
  return `${DISCORD_AUTHORIZE_URL}?${params.toString()}`;
}
