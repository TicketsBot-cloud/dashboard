import type { Panel } from "@/types";
import { normalizeEmbedTimestampForApi } from "@/lib/embed-timestamp";
import { toApiComponents, type V2Component } from "@/lib/component-tree";

export type PanelEmote =
  | string
  | {
      name: string;
      id: string;
      animated?: boolean;
    };

const READ_ONLY_PANEL_KEYS = [
  "panel_id",
  "guild_id",
  "welcome_message_embed",
  "force_disabled",
  "has_support_hours",
  "is_currently_active",
  "use_server_default_naming_scheme",
  "emoji_name",
  "emoji_id",
  "emoji_animated",
  "use_custom_emoji",
] as const;

function setBlankStringsToNull(value: unknown): void {
  if (value === null || typeof value !== "object") return;

  if (Array.isArray(value)) {
    for (const item of value) {
      setBlankStringsToNull(item);
    }
    return;
  }

  for (const [key, entry] of Object.entries(value)) {
    if (entry === "" || entry === "null") {
      (value as Record<string, unknown>)[key] = null;
    } else if (entry !== null && typeof entry === "object") {
      setBlankStringsToNull(entry);
    }
  }
}

export function panelEmoteName(emote?: Panel["emote"]): string {
  if (!emote) return "";
  return typeof emote === "string" ? emote : emote.name;
}

/**
 * `Panel.message_components`/`welcome_message_components` hold our editor's `V2Component[]`
 * shape while a page is being edited, but the API expects Discord's raw `{type: number, ...}`
 * shape. Discriminate on `type` being a string (ours) vs a number (raw, or already-converted) -
 * an empty tree round-trips fine either way.
 */
function marshalComponentsField(value: Panel["message_components"]): Panel["message_components"] {
  if (!value || typeof value === "string") return value ?? null;
  if (value.length > 0 && typeof (value[0] as { type: unknown }).type === "string") {
    return toApiComponents(value as unknown as V2Component[]) as Panel["message_components"];
  }
  return value;
}

function buildPanelEmote(panel: Panel): PanelEmote | null {
  if (panel.use_custom_emoji && panel.emoji_id && panel.emoji_name) {
    return {
      name: panel.emoji_name,
      id: panel.emoji_id,
      animated: panel.emoji_animated ?? false,
    };
  }

  if (typeof panel.emote === "string" && panel.emote) {
    return panel.emote;
  }

  if (panel.emote && typeof panel.emote === "object" && "name" in panel.emote) {
    return panel.emote;
  }

  return null;
}

/** Shape panel state for PATCH/POST. */
export function preparePanelForApi(panel: Panel): Partial<Panel> {
  const payload = { ...panel } as Partial<Panel> & Record<string, unknown>;

  for (const key of READ_ONLY_PANEL_KEYS) {
    delete payload[key];
  }

  payload.emote = buildPanelEmote(panel) as Panel["emote"];

  if (!panel.overflow_enabled) {
    delete payload.overflow_category_id;
  }

  if (panel.welcome_message) {
    payload.welcome_message = {
      ...panel.welcome_message,
      timestamp: normalizeEmbedTimestampForApi(panel.welcome_message.timestamp),
    };
  }

  payload.message_components = marshalComponentsField(panel.message_components);
  payload.welcome_message_components = marshalComponentsField(panel.welcome_message_components);

  setBlankStringsToNull(payload);
  return payload;
}
