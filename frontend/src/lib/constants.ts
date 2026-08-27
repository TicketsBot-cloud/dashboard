const env = import.meta.env;

function requireEnv(name: string, devFallback: string): string {
  const value = env[name];
  if (value) return value;
  if (env.DEV) return devFallback;
  throw new Error(`${name} must be configured for production builds`);
}

export const BASE_URL = requireEnv("VITE_BASE_URL", "http://localhost:5173");
export const API_URL = requireEnv("VITE_API_URL", "http://localhost:8081");
export const WS_URL = requireEnv("VITE_WS_URL", "ws://localhost:8081");
export const BOT_ID = requireEnv("VITE_BOT_ID", "1347257062563909632");
export const DOCS_URL = env.VITE_DOCS_URL || "https://docs.tickets.bot";
export const PATREON_URL = env.VITE_PATREON_URL || "https://www.patreon.com/ticketsbot-cloud";
export const KB_DOMAIN = env.VITE_KB_DOMAIN || "kb.tickets.bot";
export const GROWTHBOOK_URL = env.VITE_GROWTHBOOK_URL || "http://growthbook.prod";
