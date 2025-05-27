export const IMPORT_URL = env.IMPORT_URL || "https://import-api.ticketsbot.cloud"
export const API_URL = env.API_URL || "http://localhost:8081"
export const PLACEHOLDER_DOCS_URL = "https://docs.ticketsbot.cloud/setup/placeholders.html"
export const INVITE_URL = env.INVITE_URL || "https://invite.ticketsbot.cloud"

export const OAUTH = {
    clientId: env.CLIENT_ID || "1325579039888511056",
    redirectUri: env.REDIRECT_URI || "http://localhost:5000/callback"
}

export const SENTRY = {
    dsn: env.SENTRY_DSN || "",
    tracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE ? parseFloat(env.SENTRY_TRACES_SAMPLE_RATE) : 1.0,
    replaysSessionSampleRate: env.SENTRY_REPLAYS_SESSION_SAMPLE_RATE ? parseFloat(env.SENTRY_REPLAYS_SESSION_SAMPLE_RATE) : 1.0,
    replaysOnErrorSampleRate: env.SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE ? parseFloat(env.SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE) : 1.0,
}