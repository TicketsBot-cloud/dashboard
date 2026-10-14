import type { Panel } from "@/types";
import type { APIMessageTopLevelComponent } from "discord-api-types/v10";
import { RE_HEADING } from "@/lib/discord-markdown";
import { intToColour } from "@/lib/colour";
import { isSafeUrl } from "@/lib/url";

// discord-api-types/v10 has no ComponentType member for Container (17).
const DiscordComponentType = {
  ActionRow: 1,
  Button: 2,
  StringSelect: 3,
  Section: 9,
  TextDisplay: 10,
  Thumbnail: 11,
  MediaGallery: 12,
  Separator: 14,
  Container: 17,
} as const;

const ButtonStyle = {
  Primary: 1,
  Link: 5,
} as const;

/** Wire custom IDs for placed panels. The backend resolves these into real buttons and dropdowns. */
const PANEL_CUSTOM_ID_PREFIX = "panel:";
const PANEL_SELECT_CUSTOM_ID = "multipanel";

export const MAX_COMPONENTS = 40;
export const MAX_TEXT_CHARACTERS = 4000;
export const MAX_URL_LENGTH = 512;
export const MAX_ALT_TEXT_LENGTH = 1024;
export const MAX_SECTION_TEXTS = 3;
export const MAX_GALLERY_ITEMS = 10;
export const MAX_ROW_BUTTONS = 5;

/** Components the bot appends to a panel's button message (the open-ticket row and its button). */
export const PANEL_MESSAGE_RESERVED = 2;

/** Components reserved on a welcome message for the form answers. */
const WELCOME_FORM_RESERVED = 5;

export type V2ComponentType =
  | "container"
  | "section"
  | "text_display"
  | "media_gallery"
  | "separator"
  | "button_row"
  | "panel_select";

interface V2Base {
  id: string;
}

export interface V2TextChild {
  id: string;
  content: string;
}

export type V2Accessory =
  | { kind: "thumbnail"; url: string; description?: string; spoiler?: boolean }
  | { kind: "link_button"; label: string; url: string }
  | { kind: "panel_button"; panel_id: number };

export interface V2Container extends V2Base {
  type: "container";
  accentColor?: string;
  spoiler?: boolean;
  components: V2Component[];
}

export interface V2Section extends V2Base {
  type: "section";
  components: V2TextChild[];
  accessory?: V2Accessory;
}

export interface V2TextDisplay extends V2Base {
  type: "text_display";
  content: string;
}

export interface V2MediaGalleryItem {
  url: string;
  description?: string;
  spoiler?: boolean;
}

export interface V2MediaGallery extends V2Base {
  type: "media_gallery";
  items: V2MediaGalleryItem[];
}

export interface V2Separator extends V2Base {
  type: "separator";
  divider: boolean;
  spacing: 1 | 2;
}

export type V2ButtonRowButton =
  | { id: string; kind?: "link"; label: string; url: string }
  | { id: string; kind: "panel"; panel_id: number };

export interface V2ButtonRow extends V2Base {
  type: "button_row";
  buttons: V2ButtonRowButton[];
}

/** A placed dropdown of every panel not placed elsewhere. It has no fields of its own. */
export interface V2PanelSelect extends V2Base {
  type: "panel_select";
}

export type V2Component =
  | V2Container
  | V2Section
  | V2TextDisplay
  | V2MediaGallery
  | V2Separator
  | V2ButtonRow
  | V2PanelSelect;

function newId(): string {
  return crypto.randomUUID();
}

export function createEmptyBlock(type: V2ComponentType): V2Component {
  switch (type) {
    case "container":
      return { id: newId(), type: "container", components: [] };
    case "section":
      return { id: newId(), type: "section", components: [{ id: newId(), content: "" }] };
    case "text_display":
      return { id: newId(), type: "text_display", content: "" };
    case "media_gallery":
      return { id: newId(), type: "media_gallery", items: [] };
    case "separator":
      return { id: newId(), type: "separator", divider: true, spacing: 1 };
    case "button_row":
      return { id: newId(), type: "button_row", buttons: [{ id: newId(), label: "", url: "" }] };
    case "panel_select":
      return { id: newId(), type: "panel_select" };
  }
}

export function blockLabel(type: V2ComponentType): string {
  switch (type) {
    case "container":
      return "Container";
    case "section":
      return "Section";
    case "text_display":
      return "Text Display";
    case "media_gallery":
      return "Media Gallery";
    case "separator":
      return "Separator";
    case "button_row":
      return "Button Row";
    case "panel_select":
      return "Panel Select";
  }
}

function hexToColourInt(hex: string): number | undefined {
  const cleaned = hex.replace("#", "").trim();
  if (!/^[0-9a-fA-F]{6}$/.test(cleaned)) return undefined;
  return parseInt(cleaned, 16);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ApiComponent = Record<string, any>;

/** Switches the tree walk from the save shape to the shape a placed panel resolves to. */
interface PreviewResolver {
  lookup: Panel[];
  selectOptions: Panel[];
  selectPlaceholder?: string;
}

function resolveEmoteName(emote: Panel["emote"] | undefined): string {
  if (typeof emote === "string") return emote;
  if (emote && typeof emote === "object") return emote.name;
  return "";
}

function buildEmoji(p: Panel): { name: string; id?: string; animated?: boolean } | undefined {
  const emoteName = resolveEmoteName(p.emote);
  if (p.use_custom_emoji) {
    return p.emoji_id ? { name: emoteName, id: p.emoji_id, animated: p.emoji_animated } : undefined;
  }
  return emoteName ? { name: emoteName } : undefined;
}

function resolvePanelButton(panelId: number, panels: Panel[]): ApiComponent | null {
  const p = panels.find((panel) => panel.panel_id === panelId);
  if (!p) return null;

  const emoji = buildEmoji(p);
  return {
    type: DiscordComponentType.Button,
    style: parseInt(p.button_style) || ButtonStyle.Primary,
    label: p.button_label || "Open Ticket",
    custom_id: "preview",
    ...(emoji ? { emoji } : {}),
  };
}

function buildSelectOption(p: Panel) {
  const emoji = buildEmoji(p);
  return {
    value: String(p.panel_id),
    label: p.button_label || "Open Ticket",
    ...(emoji ? { emoji } : {}),
  };
}

function panelButtonWire(panelId: number): ApiComponent {
  return {
    type: DiscordComponentType.Button,
    style: ButtonStyle.Primary,
    custom_id: `${PANEL_CUSTOM_ID_PREFIX}${panelId}`,
  };
}

function linkButtonWire(label: string, url: string): ApiComponent {
  return { type: DiscordComponentType.Button, style: ButtonStyle.Link, label, url };
}

function parsePanelCustomId(c: ApiComponent): number | null {
  if (c?.type !== DiscordComponentType.Button || c.url !== undefined) return null;
  if (typeof c.custom_id !== "string") return null;
  const match = /^panel:(\d+)$/.exec(c.custom_id);
  return match ? Number(match[1]) : null;
}

function buildComponent(block: V2Component, resolve?: PreviewResolver): ApiComponent | null {
  switch (block.type) {
    case "container": {
      const accentColor = block.accentColor ? hexToColourInt(block.accentColor) : undefined;
      return {
        type: DiscordComponentType.Container,
        components: block.components
          .map((child) => buildComponent(child, resolve))
          .filter((c): c is ApiComponent => c !== null),
        ...(accentColor !== undefined ? { accent_color: accentColor } : {}),
        ...(block.spoiler ? { spoiler: true } : {}),
      };
    }
    case "section": {
      const section: ApiComponent = {
        type: DiscordComponentType.Section,
        components: block.components.map((child) => ({
          type: DiscordComponentType.TextDisplay,
          content: child.content,
        })),
      };
      // The backend's Section.Accessory cannot unmarshal a literal null, so the key is omitted.
      const accessory = block.accessory;
      if (accessory?.kind === "thumbnail") {
        section.accessory = {
          type: DiscordComponentType.Thumbnail,
          media: { url: accessory.url },
          ...(accessory.description ? { description: accessory.description } : {}),
          ...(accessory.spoiler ? { spoiler: true } : {}),
        };
      } else if (accessory?.kind === "link_button") {
        section.accessory = linkButtonWire(accessory.label, accessory.url);
      } else if (accessory?.kind === "panel_button") {
        if (!resolve) {
          section.accessory = panelButtonWire(accessory.panel_id);
        } else {
          const resolved = resolvePanelButton(accessory.panel_id, resolve.lookup);
          if (resolved) section.accessory = resolved;
        }
      }
      return section;
    }
    case "text_display":
      return { type: DiscordComponentType.TextDisplay, content: block.content };
    case "media_gallery":
      return {
        type: DiscordComponentType.MediaGallery,
        items: block.items.map((item) => ({
          media: { url: item.url },
          ...(item.description ? { description: item.description } : {}),
          ...(item.spoiler ? { spoiler: true } : {}),
        })),
      };
    case "separator":
      return {
        type: DiscordComponentType.Separator,
        divider: block.divider,
        spacing: block.spacing,
      };
    case "button_row": {
      const buttons = block.buttons.flatMap((b): ApiComponent[] => {
        if (b.kind !== "panel") return [linkButtonWire(b.label, b.url)];
        if (!resolve) return [panelButtonWire(b.panel_id)];
        const resolved = resolvePanelButton(b.panel_id, resolve.lookup);
        return resolved ? [resolved] : [];
      });
      return { type: DiscordComponentType.ActionRow, components: buttons };
    }
    case "panel_select": {
      if (!resolve) {
        return {
          type: DiscordComponentType.ActionRow,
          components: [
            {
              type: DiscordComponentType.StringSelect,
              custom_id: PANEL_SELECT_CUSTOM_ID,
              options: [],
            },
          ],
        };
      }
      // A select with no options is invalid, so the backend drops it too.
      if (resolve.selectOptions.length === 0) return null;
      return {
        type: DiscordComponentType.ActionRow,
        components: [
          {
            type: DiscordComponentType.StringSelect,
            custom_id: "preview",
            placeholder: resolve.selectPlaceholder || "Select a topic...",
            options: resolve.selectOptions.map(buildSelectOption),
          },
        ],
      };
    }
  }
}

// Cast because discord-api-types' per-type literal interfaces can't be satisfied by a plain record.
export function toApiComponents(tree: V2Component[]): APIMessageTopLevelComponent[] {
  return tree.map((block) => buildComponent(block)) as unknown as APIMessageTopLevelComponent[];
}

/**
 * Preview-only counterpart of `toApiComponents`: placed panels resolve to real labels and emoji.
 * `panels` must be every panel in the multi-panel, since a placement can reference any of them.
 */
export function toPreviewComponents(
  tree: V2Component[],
  panels: Panel[],
  selectPlaceholder?: string,
): APIMessageTopLevelComponent[] {
  const placedIds = getPlacedPanelIds(tree);
  const resolve: PreviewResolver = {
    lookup: panels,
    selectOptions: panels.filter((p) => !placedIds.has(p.panel_id)),
    selectPlaceholder,
  };
  return tree
    .map((block) => buildComponent(block, resolve))
    .filter((c): c is ApiComponent => c !== null) as unknown as APIMessageTopLevelComponent[];
}

/**
 * Parses a stored tree. The panel endpoints return the column as a JSON string; a parsed array
 * (echoed after a create) and null are tolerated too.
 */
export function fromApiComponents(raw: unknown): V2Component[] {
  let value: unknown = raw;

  if (typeof value === "string") {
    if (!value.trim()) return [];
    try {
      value = JSON.parse(value);
    } catch {
      return [];
    }
  }

  if (!Array.isArray(value)) return [];

  const result: V2Component[] = [];
  for (const node of value) {
    const parsed = fromApiComponent(node);
    if (parsed) result.push(parsed);
  }
  return result;
}

function fromApiComponent(node: unknown): V2Component | null {
  if (!node || typeof node !== "object") return null;
  const obj = node as ApiComponent;

  switch (obj.type) {
    case DiscordComponentType.Container: {
      const rawAccent = obj.accent_color;
      return {
        id: newId(),
        type: "container",
        accentColor: typeof rawAccent === "number" ? intToColour(rawAccent) : undefined,
        spoiler: !!obj.spoiler,
        components: fromApiComponents(obj.components),
      };
    }
    case DiscordComponentType.Section: {
      const textChildren: V2TextChild[] = Array.isArray(obj.components)
        ? obj.components
            .filter((c: ApiComponent) => c && c.type === DiscordComponentType.TextDisplay)
            .map((c: ApiComponent) => ({
              id: newId(),
              content: typeof c.content === "string" ? c.content : "",
            }))
        : [];

      // A missing accessory can round-trip through storage as an empty object.
      const accessoryRaw = obj.accessory;
      let accessory: V2Accessory | undefined;
      if (accessoryRaw && typeof accessoryRaw === "object") {
        const panelId = parsePanelCustomId(accessoryRaw);
        if (accessoryRaw.type === DiscordComponentType.Thumbnail && accessoryRaw.media?.url) {
          accessory = {
            kind: "thumbnail",
            url: accessoryRaw.media.url,
            description: accessoryRaw.description ?? undefined,
            spoiler: !!accessoryRaw.spoiler,
          };
        } else if (
          accessoryRaw.type === DiscordComponentType.Button &&
          accessoryRaw.style === ButtonStyle.Link &&
          typeof accessoryRaw.url === "string"
        ) {
          accessory = {
            kind: "link_button",
            label: typeof accessoryRaw.label === "string" ? accessoryRaw.label : "",
            url: accessoryRaw.url,
          };
        } else if (panelId !== null) {
          accessory = { kind: "panel_button", panel_id: panelId };
        }
      }

      return { id: newId(), type: "section", components: textChildren, accessory };
    }
    case DiscordComponentType.TextDisplay:
      return {
        id: newId(),
        type: "text_display",
        content: typeof obj.content === "string" ? obj.content : "",
      };
    case DiscordComponentType.MediaGallery: {
      const items: V2MediaGalleryItem[] = Array.isArray(obj.items)
        ? obj.items
            .filter((i: ApiComponent) => i?.media?.url)
            .map((i: ApiComponent) => ({
              url: i.media.url,
              description: i.description ?? undefined,
              spoiler: !!i.spoiler,
            }))
        : [];
      return { id: newId(), type: "media_gallery", items };
    }
    case DiscordComponentType.Separator:
      return {
        id: newId(),
        type: "separator",
        divider: obj.divider ?? true,
        spacing: obj.spacing === 2 ? 2 : 1,
      };
    case DiscordComponentType.ActionRow: {
      const children = Array.isArray(obj.components) ? obj.components : [];

      if (
        children.length === 1 &&
        children[0]?.type === DiscordComponentType.StringSelect &&
        children[0]?.custom_id === PANEL_SELECT_CUSTOM_ID
      ) {
        return { id: newId(), type: "panel_select" };
      }

      const isLinkButton = (c: ApiComponent) =>
        c?.type === DiscordComponentType.Button &&
        c?.style === ButtonStyle.Link &&
        typeof c?.url === "string";

      // Rows the builder cannot represent (e.g. other interactive rows) are dropped, not edited.
      const allRepresentable =
        children.length > 0 &&
        children.every((c: ApiComponent) => isLinkButton(c) || parsePanelCustomId(c) !== null);
      if (!allRepresentable) return null;

      return {
        id: newId(),
        type: "button_row",
        buttons: children.map((c: ApiComponent): V2ButtonRowButton => {
          const panelId = parsePanelCustomId(c);
          return panelId !== null
            ? { id: newId(), kind: "panel", panel_id: panelId }
            : { id: newId(), label: typeof c.label === "string" ? c.label : "", url: c.url };
        }),
      };
    }
    default:
      return null;
  }
}

// Mirrors discord-markdown.ts's RE_FENCE so a "#" line inside a code fence is never a heading.
const RE_FENCE = /```(?:([A-Za-z0-9+#._-]*)\n)?([\s\S]*?)```\n?/g;

/** Splits a classic body on heading lines, leaving fenced code intact. Segments are verbatim slices. */
function splitOnHeadings(body: string): string[] {
  if (!body) return [];

  const fenceRanges: Array<{ start: number; end: number }> = [];
  for (const fence of body.matchAll(RE_FENCE)) {
    fenceRanges.push({ start: fence.index, end: fence.index + fence[0].length });
  }
  const isInsideFence = (offset: number) =>
    fenceRanges.some((range) => offset >= range.start && offset < range.end);

  const segments: string[] = [];
  let segmentStart = 0;
  let cursor = 0;

  for (const line of body.split("\n")) {
    const lineStart = cursor;
    cursor += line.length + 1;

    if (!isInsideFence(lineStart) && RE_HEADING.test(line)) {
      const segment = body.slice(segmentStart, lineStart).replace(/\n$/, "");
      if (segment.length > 0) segments.push(segment);
      segmentStart = lineStart;
    }
  }

  const last = body.slice(segmentStart).replace(/\n$/, "");
  if (last.length > 0) segments.push(last);

  return segments;
}

/** Every field is optional: panel messages carry only title, body, colour and images. */
export interface ClassicConversionSource {
  title?: string;
  body?: string;
  colourHex: string;
  imageUrl?: string;
  thumbnailUrl?: string;
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
  authorName?: string;
  authorUrl?: string;
  footerText?: string;
}

/**
 * Splits the body on headings, turns images into a media gallery, and folds fields, author and
 * footer into text. If the result exceeds `maxBlocks`, trailing text blocks are merged until it
 * fits. The media gallery is never merged away.
 */
export function convertClassicToComponentsV2(
  source: ClassicConversionSource,
  maxBlocks: number,
): { tree: V2Component[]; folded: boolean } {
  const segments: string[] = [];

  if (source.title && source.title.trim().length > 0) {
    segments.push(`# ${source.title}`);
  }

  for (const segment of splitOnHeadings(source.body ?? "")) {
    segments.push(segment);
  }

  if (source.fields && source.fields.length > 0) {
    segments.push(source.fields.map((f) => `**${f.name}**\n${f.value}`).join("\n\n"));
  }

  if (source.authorName && source.authorName.trim().length > 0) {
    const authorLine =
      source.authorUrl && isSafeUrl(source.authorUrl)
        ? `-# [${source.authorName}](${source.authorUrl})`
        : `-# ${source.authorName}`;
    if (segments.length === 0) {
      segments.push(authorLine);
    } else {
      segments[0] = `${authorLine}\n${segments[0]}`;
    }
  }

  if (source.footerText && source.footerText.trim().length > 0) {
    const footerLine = `-# ${source.footerText}`;
    if (segments.length === 0) {
      segments.push(footerLine);
    } else {
      segments[segments.length - 1] = `${segments[segments.length - 1]}\n${footerLine}`;
    }
  }

  const mediaItems: V2MediaGalleryItem[] = [];
  if (source.imageUrl && isSafeUrl(source.imageUrl)) mediaItems.push({ url: source.imageUrl });
  if (source.thumbnailUrl && isSafeUrl(source.thumbnailUrl)) {
    mediaItems.push({ url: source.thumbnailUrl });
  }

  if (segments.length === 0 && mediaItems.length === 0) {
    return { tree: [], folded: false };
  }

  let textBlocks: V2TextDisplay[] = segments.map((content) => ({
    id: newId(),
    type: "text_display" as const,
    content,
  }));
  const mediaBlock: V2MediaGallery | null =
    mediaItems.length > 0 ? { id: newId(), type: "media_gallery", items: mediaItems } : null;

  const buildContainer = (): V2Container => ({
    id: newId(),
    type: "container",
    accentColor: source.colourHex,
    components: mediaBlock ? [...textBlocks, mediaBlock] : [...textBlocks],
  });

  let folded = false;
  let container = buildContainer();

  while (countBlocks([container]) > maxBlocks && textBlocks.length > 1) {
    const mergedContent = `${textBlocks[textBlocks.length - 2].content}\n\n${textBlocks[textBlocks.length - 1].content}`;
    textBlocks = [
      ...textBlocks.slice(0, -2),
      { id: newId(), type: "text_display", content: mergedContent },
    ];
    folded = true;
    container = buildContainer();
  }

  return { tree: [container], folded };
}

/** Whether `convertClassicToComponentsV2` would produce anything. Unsafe image URLs don't count. */
export function hasConvertibleClassicContent(source: ClassicConversionSource): boolean {
  return !!(
    source.title?.trim() ||
    source.body?.trim() ||
    source.fields?.length ||
    source.authorName?.trim() ||
    source.footerText?.trim() ||
    (source.imageUrl && isSafeUrl(source.imageUrl)) ||
    (source.thumbnailUrl && isSafeUrl(source.thumbnailUrl))
  );
}

/** Applies a conversion only if it produced something, so an all-unsafe-URL source cannot wipe the tree. */
export function applyClassicConversion(
  source: ClassicConversionSource,
  maxBlocks: number,
  setTree: (tree: V2Component[]) => void,
): { converted: boolean; folded: boolean } {
  const result = convertClassicToComponentsV2(source, maxBlocks);
  if (result.tree.length === 0) {
    return { converted: false, folded: false };
  }
  setTree(result.tree);
  return { converted: true, folded: result.folded };
}

/** Mirrors the backend's component count: every block, its children, section accessories and button rows. */
export function countBlocks(tree: V2Component[]): number {
  let count = 0;
  for (const block of tree) {
    count++;
    if (block.type === "container") {
      count += countBlocks(block.components);
    } else if (block.type === "section") {
      count += block.components.length;
      if (block.accessory) count++;
    } else if (block.type === "button_row") {
      count += block.buttons.length;
    } else if (block.type === "panel_select") {
      count += 1;
    }
  }
  return count;
}

interface WelcomeButtonSettings {
  hide_close_button?: boolean;
  hide_close_with_reason_button?: boolean;
  hide_claim_button?: boolean;
  use_threads?: boolean;
}

/** Which of the auto-appended welcome buttons are shown. Claim does not exist in thread mode. */
export function visibleWelcomeButtons(panel: WelcomeButtonSettings) {
  return {
    close: !panel.hide_close_button,
    closeWithReason: !panel.hide_close_with_reason_button,
    claim: !panel.hide_claim_button && !panel.use_threads,
  };
}

/** Components reserved on a welcome message: form answers, plus the close/claim row when shown. */
export function welcomeReserved(panel: WelcomeButtonSettings): number {
  const { close, closeWithReason, claim } = visibleWelcomeButtons(panel);
  const buttons = Number(close) + Number(closeWithReason) + Number(claim);
  return WELCOME_FORM_RESERVED + (buttons > 0 ? buttons + 1 : 0);
}

/**
 * Components the backend appends to a multi-panel message. A placed dropdown absorbs every
 * unplaced panel, so nothing is appended. Otherwise dropdown mode appends one row and one select,
 * and button mode appends rows of up to 5 buttons for the panels not placed in the tree.
 */
export function multiPanelReserved(opts: {
  selectMenu: boolean;
  hasPlacedSelect: boolean;
  panelCount: number;
  placedCount: number;
}): number {
  const unplaced = Math.max(0, opts.panelCount - opts.placedCount);
  if (opts.hasPlacedSelect || unplaced === 0) return 0;
  if (opts.selectMenu) return 2;
  return Math.ceil(unplaced / MAX_ROW_BUTTONS) + unplaced;
}

export function getPlacedPanelIds(tree: V2Component[]): Set<number> {
  const ids = new Set<number>();

  const visit = (nodes: V2Component[]) => {
    for (const block of nodes) {
      if (block.type === "container") {
        visit(block.components);
      } else if (block.type === "section") {
        if (block.accessory?.kind === "panel_button") ids.add(block.accessory.panel_id);
      } else if (block.type === "button_row") {
        for (const button of block.buttons) {
          if (button.kind === "panel") ids.add(button.panel_id);
        }
      }
    }
  };

  visit(tree);
  return ids;
}

export function hasPanelSelectBlock(tree: V2Component[]): boolean {
  return tree.some(
    (block) =>
      block.type === "panel_select" ||
      (block.type === "container" && hasPanelSelectBlock(block.components)),
  );
}

/** Dropdown mode off makes a placed dropdown invalid, so it is removed at the moment of the toggle. */
export function removePanelSelectBlock(tree: V2Component[]): V2Component[] {
  return tree
    .filter((block) => block.type !== "panel_select")
    .map((block) =>
      block.type === "container"
        ? { ...block, components: removePanelSelectBlock(block.components) }
        : block,
    );
}

/**
 * Removes placements of panels that are no longer in the multi-panel. Button rows left empty are
 * dropped. A section whose panel accessory goes loses the accessory and is flagged by validation.
 */
export function prunePlacedPanels(tree: V2Component[], validIds: Set<number>): V2Component[] {
  const result: V2Component[] = [];
  for (const block of tree) {
    if (block.type === "container") {
      result.push({ ...block, components: prunePlacedPanels(block.components, validIds) });
    } else if (block.type === "section") {
      const stale =
        block.accessory?.kind === "panel_button" && !validIds.has(block.accessory.panel_id);
      result.push(stale ? { ...block, accessory: undefined } : block);
    } else if (block.type === "button_row") {
      const buttons = block.buttons.filter((b) => b.kind !== "panel" || validIds.has(b.panel_id));
      if (buttons.length > 0)
        result.push(buttons.length === block.buttons.length ? block : { ...block, buttons });
    } else {
      result.push(block);
    }
  }
  return result;
}

function validUrl(url: string): boolean {
  return isSafeUrl(url) && url.length <= MAX_URL_LENGTH;
}

// Shared with the editors so a field shows the same wording as the summary list.
export const BLANK_TEXT_MESSAGE = "Text cannot be blank.";
export const LINK_LABEL_MESSAGE = "Every link button needs a label.";
export const LINK_URL_MESSAGE = `Link button URLs must be http or https and at most ${MAX_URL_LENGTH} characters.`;
export const MEDIA_URL_MESSAGE = `Image URLs must be http or https and at most ${MAX_URL_LENGTH} characters.`;

export const EMPTY_TREE_MESSAGE =
  "Add at least one block. A Components v2 message cannot be empty.";

export const blankTextError = (content: string): string | undefined =>
  content.trim() ? undefined : BLANK_TEXT_MESSAGE;
export const linkLabelError = (label: string): string | undefined =>
  label.trim() ? undefined : LINK_LABEL_MESSAGE;
export const linkUrlError = (url: string): string | undefined =>
  validUrl(url) ? undefined : LINK_URL_MESSAGE;
export const mediaUrlError = (url: string): string | undefined =>
  validUrl(url) ? undefined : MEDIA_URL_MESSAGE;

export interface ComponentTreeIssue {
  message: string;
  /** The block the issue belongs to. Absent for whole-message issues such as the component limit. */
  blockId?: string;
}

/** Inline errors for the authored tree. The backend enforces the same rules. */
export function validateComponentTree(
  tree: V2Component[],
  opts: { requireContent?: boolean; reserved?: number } = {},
): ComponentTreeIssue[] {
  const issues = new Map<string, ComponentTreeIssue>();
  let textCharacters = 0;

  const add = (message: string, blockId?: string) => {
    const key = `${blockId ?? ""}|${message}`;
    if (!issues.has(key)) issues.set(key, { message, blockId });
  };

  const checkLinkButton = (blockId: string, label: string, url: string) => {
    textCharacters += label.length;
    const labelError = linkLabelError(label);
    if (labelError) add(labelError, blockId);
    const urlError = linkUrlError(url);
    if (urlError) add(urlError, blockId);
  };

  const checkMediaUrl = (blockId: string, url: string) => {
    const error = mediaUrlError(url);
    if (error) add(error, blockId);
  };

  const checkAlt = (blockId: string, alt: string | undefined) => {
    if (alt && alt.length > MAX_ALT_TEXT_LENGTH) {
      add(`Alt text can be at most ${MAX_ALT_TEXT_LENGTH} characters.`, blockId);
    }
  };

  const visit = (nodes: V2Component[], insideContainer: boolean) => {
    for (const block of nodes) {
      switch (block.type) {
        case "container":
          if (insideContainer) {
            add("A container cannot be placed inside another container.", block.id);
          }
          if (block.components.length === 0) add("A container cannot be empty.", block.id);
          visit(block.components, true);
          break;
        case "section":
          if (block.components.length < 1 || block.components.length > MAX_SECTION_TEXTS) {
            add(`A section needs 1 to ${MAX_SECTION_TEXTS} text blocks.`, block.id);
          }
          for (const child of block.components) {
            textCharacters += child.content.length;
            const error = blankTextError(child.content);
            if (error) add(error, block.id);
          }
          if (!block.accessory) {
            add("A section needs an image or button on its side.", block.id);
          } else if (block.accessory.kind === "thumbnail") {
            checkMediaUrl(block.id, block.accessory.url);
            checkAlt(block.id, block.accessory.description);
          } else if (block.accessory.kind === "link_button") {
            checkLinkButton(block.id, block.accessory.label, block.accessory.url);
          }
          break;
        case "text_display": {
          textCharacters += block.content.length;
          const error = blankTextError(block.content);
          if (error) add(error, block.id);
          break;
        }
        case "media_gallery":
          if (block.items.length < 1 || block.items.length > MAX_GALLERY_ITEMS) {
            add(`A media gallery needs 1 to ${MAX_GALLERY_ITEMS} images.`, block.id);
          }
          for (const item of block.items) {
            checkMediaUrl(block.id, item.url);
            checkAlt(block.id, item.description);
          }
          break;
        case "button_row":
          if (block.buttons.length < 1) add("A button row needs at least one button.", block.id);
          for (const button of block.buttons) {
            if (button.kind !== "panel") checkLinkButton(block.id, button.label, button.url);
          }
          break;
        default:
          break;
      }
    }
  };

  visit(tree, false);

  if (opts.requireContent && tree.length === 0) {
    add(EMPTY_TREE_MESSAGE);
  }
  const total = countBlocks(tree) + (opts.reserved ?? 0);
  if (total > MAX_COMPONENTS) {
    add(
      `This message uses ${total} of ${MAX_COMPONENTS} components, including those added automatically. Remove some blocks.`,
    );
  }
  if (textCharacters > MAX_TEXT_CHARACTERS) {
    add(
      `Text and button labels total ${textCharacters} characters. The limit is ${MAX_TEXT_CHARACTERS}.`,
    );
  }

  return [...issues.values()];
}

// Only two levels hold reorderable blocks: the top level and a single container's children.
interface BlockLocation {
  list: V2Component[];
  index: number;
  containerId?: string;
}

function locateBlock(tree: V2Component[], id: string): BlockLocation | null {
  const topIndex = tree.findIndex((b) => b.id === id);
  if (topIndex !== -1) return { list: tree, index: topIndex };

  for (const block of tree) {
    if (block.type === "container") {
      const index = block.components.findIndex((b) => b.id === id);
      if (index !== -1) return { list: block.components, index, containerId: block.id };
    }
  }

  return null;
}

export function getTopLevelContainers(tree: V2Component[]): { id: string; label: string }[] {
  return tree
    .map((block, index) => ({ block, index }))
    .filter(({ block }) => block.type === "container")
    .map(({ index }) => ({ id: tree[index].id, label: `Container ${index + 1}` }));
}

export function moveBlock(
  tree: V2Component[],
  id: string,
  direction: "up" | "down",
): V2Component[] {
  const location = locateBlock(tree, id);
  if (!location) return tree;

  const { list, index } = location;
  const swapWith = direction === "up" ? index - 1 : index + 1;
  if (swapWith < 0 || swapWith >= list.length) return tree;

  const nextList = [...list];
  [nextList[index], nextList[swapWith]] = [nextList[swapWith], nextList[index]];

  return replaceList(tree, location, nextList);
}

export function removeBlock(tree: V2Component[], id: string): V2Component[] {
  const location = locateBlock(tree, id);
  if (!location) return tree;

  const nextList = location.list.filter((b) => b.id !== id);
  return replaceList(tree, location, nextList);
}

export function updateBlock(
  tree: V2Component[],
  id: string,
  updater: (block: V2Component) => V2Component,
): V2Component[] {
  const location = locateBlock(tree, id);
  if (!location) return tree;

  const nextList = location.list.map((b) => (b.id === id ? updater(b) : b));
  return replaceList(tree, location, nextList);
}

function replaceList(
  tree: V2Component[],
  location: BlockLocation,
  nextList: V2Component[],
): V2Component[] {
  if (!location.containerId) return nextList;

  return tree.map((block) =>
    block.type === "container" && block.id === location.containerId
      ? { ...block, components: nextList }
      : block,
  );
}

export function addBlockAtTop(tree: V2Component[], block: V2Component): V2Component[] {
  return [...tree, block];
}

export function addBlockToContainer(
  tree: V2Component[],
  containerId: string,
  block: V2Component,
): V2Component[] {
  return tree.map((b) =>
    b.type === "container" && b.id === containerId
      ? { ...b, components: [...b.components, block] }
      : b,
  );
}

/** Moves a top-level block into a top-level container's children, at the end. */
export function moveBlockIntoContainer(
  tree: V2Component[],
  blockId: string,
  containerId: string,
): V2Component[] {
  const topIndex = tree.findIndex((b) => b.id === blockId);
  if (topIndex === -1) return tree;

  const block = tree[topIndex];
  const withoutBlock = tree.filter((b) => b.id !== blockId);
  return addBlockToContainer(withoutBlock, containerId, block);
}

/** Moves a block out of its container to the top level, right after that container. */
export function moveBlockOutOfContainer(tree: V2Component[], blockId: string): V2Component[] {
  const containerIndex = tree.findIndex(
    (b) => b.type === "container" && b.components.some((child) => child.id === blockId),
  );
  if (containerIndex === -1) return tree;

  const container = tree[containerIndex] as V2Container;
  const block = container.components.find((child) => child.id === blockId)!;
  const updatedContainer: V2Container = {
    ...container,
    components: container.components.filter((child) => child.id !== blockId),
  };

  const next = [...tree];
  next[containerIndex] = updatedContainer;
  next.splice(containerIndex + 1, 0, block);
  return next;
}
