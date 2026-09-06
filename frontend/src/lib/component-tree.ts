import type { Panel } from "@/types";
import type { APIMessageTopLevelComponent } from "discord-api-types/v10";
import { RE_HEADING } from "@/lib/discord-markdown";
import { isSafeUrl } from "@/lib/url";

/**
 * Discord's numeric component type codes (gdl/objects/interaction/component/component.go's
 * ComponentType enum). Kept local rather than imported from discord-api-types because this
 * module also needs Container (17), which discord-api-types/v10 does not yet export a
 * ComponentType member for.
 */
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

/** Discord's ButtonStyle enum (gdl/objects/interaction/component/componentbutton.go). Only Link is used here. */
const ButtonStyle = {
  Link: 5,
} as const;

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

/**
 * A Section's accessory: an image (Thumbnail), a link-style button, or a placed panel-open
 * button. Link buttons carry no `custom_id` and are handled entirely client-side by Discord, and
 * a panel-button accessory carries no `custom_id` either (the backend resolves it into a real
 * button server-side), so neither reopens the "no interactive elements" restriction that still
 * applies everywhere else in the tree - a regular custom_id button or any select menu remains
 * banned, including here.
 */
export type V2Accessory =
  | { kind: "thumbnail"; url: string; description?: string; spoiler?: boolean }
  | { kind: "link_button"; label: string; url: string; emoji?: string }
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

/**
 * A button within a button_row. `kind` is absent/undefined for a plain link button (the shape
 * every tree saved before this feature has, with no `kind` field at all), so existing trees keep
 * parsing and round-tripping identically. `kind: "panel"` is a placeholder the backend resolves
 * into a real "open ticket" button server-side - it carries no `custom_id`/`url`/`label` of its
 * own on the wire, only the id of the panel it opens.
 */
export type V2ButtonRowButton =
  | { id: string; kind?: "link"; label: string; url: string; emoji?: string }
  | { id: string; kind: "panel"; panel_id: number };

/** A row of up to 5 buttons (link and/or placed-panel) - Discord's per-ActionRow child limit. No custom_id anywhere. */
export interface V2ButtonRow extends V2Base {
  type: "button_row";
  buttons: V2ButtonRowButton[];
}

/**
 * A placeable panel-select dropdown. On the wire this is an ActionRow wrapping a single
 * placeholder SelectMenu (`is_panel_select: true`), matching Discord's requirement that a select
 * menu be the sole child of its own ActionRow, but in the editable tree it is a single flat
 * block with no fields of its own - the backend resolves it into a real dropdown of every unplaced
 * panel server-side.
 */
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

function colourIntToHex(value: number): string {
  return `#${value.toString(16).padStart(6, "0")}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ApiComponent = Record<string, any>;

/**
 * Context that switches the shared tree walk (`buildComponent`) from raw/unresolved mode
 * (undefined - what gets saved) into preview/resolved mode (what a placed panel node will
 * actually look like once the backend substitutes it). `lookup` is every panel in the
 * multipanel, needed because a placed button/accessory can reference any panel, placed or not.
 * `selectOptions` is only the still-unplaced ones, which is what a panel_select block's dropdown
 * should offer - see `toPreviewComponents`' doc comment for how that set is derived.
 */
interface PreviewResolver {
  lookup: Panel[];
  selectOptions: Panel[];
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

/**
 * Resolves a placed panel_id into the real button it will render as once the backend
 * substitutes it - mirrors PanelPreview.tsx's own panel-button field mapping so the preview
 * matches production exactly. Builds the raw wire ApiComponent shape (not a React element)
 * since this only ever feeds the read-only DiscordComponents renderer; a fake custom_id is fine
 * for the same reason, it is never submitted anywhere. Returns null when the panel_id no longer
 * exists in `panels` (deselected from the multipanel while a stale tree node still points at it)
 * so the caller can drop the node rather than render something broken.
 */
function resolvePanelButton(panelId: number, panels: Panel[]): ApiComponent | null {
  const p = panels.find((panel) => panel.panel_id === panelId);
  if (!p) return null;

  const emoji = buildEmoji(p);
  return {
    type: DiscordComponentType.Button,
    style: parseInt(p.button_style) || 1,
    label: p.button_label || "Open Ticket",
    custom_id: "preview",
    ...(emoji ? { emoji } : {}),
  };
}

function buildSelectOption(p: Panel): {
  value: string;
  label: string;
  emoji?: { name: string; id?: string; animated?: boolean };
} {
  const emoji = buildEmoji(p);
  return {
    value: String(p.panel_id),
    label: p.button_label || "Open Ticket",
    ...(emoji ? { emoji } : {}),
  };
}

function buildLinkButtonWire(b: Extract<V2ButtonRowButton, { kind?: "link" }>): ApiComponent {
  return {
    type: DiscordComponentType.Button,
    style: ButtonStyle.Link,
    label: b.label,
    url: b.url,
    ...(b.emoji ? { emoji: { name: b.emoji } } : {}),
  };
}

/**
 * The single tree walk shared by `toApiComponents` (raw/unresolved - what gets saved) and
 * `toPreviewComponents` (resolved - what the live preview shows), so the two never drift apart
 * for the node types they treat identically. `resolve` undefined means raw mode: every branch
 * behaves exactly as this function did before panel placement existed. `resolve` present means
 * preview mode, and only the three panel-placement branches (button_row panel button, section
 * panel_button accessory, panel_select) differ - everything else still passes through unchanged.
 */
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
      // Omitting the key entirely (rather than sending null) matters: Section.Accessory is a
      // non-pointer Component on the backend, and its custom UnmarshalJSON chokes on a literal
      // JSON null (it never reaches the "type" field, so it fails with ErrMissingType and the
      // whole ShouldBindJSON call fails). Only ever include this key when there is an accessory.
      if (block.accessory?.kind === "thumbnail") {
        section.accessory = {
          type: DiscordComponentType.Thumbnail,
          media: { url: block.accessory.url },
          ...(block.accessory.description ? { description: block.accessory.description } : {}),
          ...(block.accessory.spoiler ? { spoiler: true } : {}),
        };
      } else if (block.accessory?.kind === "link_button") {
        section.accessory = {
          type: DiscordComponentType.Button,
          style: ButtonStyle.Link,
          label: block.accessory.label,
          url: block.accessory.url,
          ...(block.accessory.emoji ? { emoji: { name: block.accessory.emoji } } : {}),
        };
      } else if (block.accessory?.kind === "panel_button") {
        if (!resolve) {
          section.accessory = {
            type: DiscordComponentType.Button,
            panel_id: block.accessory.panel_id,
          };
        } else {
          const resolved = resolvePanelButton(block.accessory.panel_id, resolve.lookup);
          // No key at all when unresolved (see the note above on omitting `accessory`) - the
          // panel was deselected from the multipanel, so render the section with no accessory
          // rather than a broken button.
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
      const buttons = resolve
        ? block.buttons.flatMap((b) => {
            if (b.kind !== "panel") return [buildLinkButtonWire(b)];
            const resolved = resolvePanelButton(b.panel_id, resolve.lookup);
            return resolved ? [resolved] : [];
          })
        : block.buttons.map((b) =>
            b.kind === "panel"
              ? { type: DiscordComponentType.Button, panel_id: b.panel_id }
              : buildLinkButtonWire(b),
          );
      return { type: DiscordComponentType.ActionRow, components: buttons };
    }
    case "panel_select": {
      if (!resolve) {
        return {
          type: DiscordComponentType.ActionRow,
          components: [
            {
              type: DiscordComponentType.StringSelect,
              is_panel_select: true,
              options: [],
            },
          ],
        };
      }
      // Mirrors the backend's own resolveComponentTreePanelRefs: a select with zero options is
      // invalid, so skip the block entirely rather than render a broken dropdown.
      if (resolve.selectOptions.length === 0) return null;
      return {
        type: DiscordComponentType.ActionRow,
        components: [
          {
            type: DiscordComponentType.StringSelect,
            custom_id: "preview",
            options: resolve.selectOptions.map(buildSelectOption),
          },
        ],
      };
    }
  }
}

/**
 * Converts our editor tree into the raw {type, ...} shape the backend and DiscordComponents
 * expect. Cast rather than structurally typed: discord-api-types' APIMessageTopLevelComponent
 * union requires exact per-type interfaces (down to literal `type` values), which a plain
 * Record<string, any> can never satisfy structurally even though the values it produces are
 * shaped correctly at runtime. This is the save-payload path - it never resolves a panel
 * placement, only ever emits the placeholder `panel_id`/`is_panel_select` shape the backend
 * resolves server-side, so a disabled feature flag or a stale preview can never affect what's
 * actually persisted.
 */
export function toApiComponents(tree: V2Component[]): APIMessageTopLevelComponent[] {
  return tree.map((block) => buildComponent(block)) as unknown as APIMessageTopLevelComponent[];
}

/**
 * Same tree walk as `toApiComponents`, but resolves every panel-placement node (a placed
 * button, a placed accessory, or a panel_select dropdown) into what it will actually look like
 * once the backend resolves it, so the live preview shows real labels/emoji rather than a blank
 * or broken button. Never used for the save payload - `toApiComponents` alone is what gets sent
 * to the backend, so a preview can never leak a resolved shape into storage.
 *
 * `panels` must be the full, unfiltered list of every panel in the multipanel, already resolved
 * to its effective label/emoji (i.e. whatever `getPreviewButtons()` already produces) - not just
 * the still-unplaced ones. A placed button/accessory can reference any panel in the multipanel,
 * so resolving it needs the full list to look up by `panel_id`. Which panels are still unplaced
 * (and therefore what a panel_select block's dropdown should actually offer) is derived
 * internally from `tree` via `getPlacedPanelIds`, mirroring the backend's own resolution -
 * callers never need to pre-filter `panels` for that purpose, they only need to hand over every
 * panel so any placement, wherever it is, can be found.
 *
 * A placement referencing a panel_id no longer in `panels` (deselected from the multipanel while
 * a stale tree node still points at it) is dropped rather than rendered broken - the affected
 * button, accessory, or select is simply omitted from that spot in the preview.
 */
export function toPreviewComponents(
  tree: V2Component[],
  panels: Panel[],
): APIMessageTopLevelComponent[] {
  const placedIds = getPlacedPanelIds(tree);
  const resolve: PreviewResolver = {
    lookup: panels,
    selectOptions: panels.filter((p) => !placedIds.has(p.panel_id)),
  };
  return tree
    .map((block) => buildComponent(block, resolve))
    .filter((c): c is ApiComponent => c !== null) as unknown as APIMessageTopLevelComponent[];
}

/**
 * Parses a stored component tree back into editor state. Defensive because this is a system
 * boundary: the value came out of the database (or a fresh POST response) rather than from
 * code we control. `GetPanel` returns `message_components`/`welcome_message_components` as a
 * JSON-encoded *string* (the column is `*string` on the Go side, not a parsed array), so a
 * string is the common case; null/undefined (no tree saved yet) and an already-parsed array
 * (e.g. echoed straight back after a create) are both tolerated too.
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
        accentColor: typeof rawAccent === "number" ? colourIntToHex(rawAccent) : undefined,
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

      // The Go zero-value Component{} (no accessory) can round-trip through storage as an
      // empty object rather than being absent; only treat it as an accessory when it actually
      // has a recognised type and the fields that type requires.
      const accessoryRaw = obj.accessory;
      let accessory: V2Accessory | undefined;
      if (accessoryRaw && typeof accessoryRaw === "object") {
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
            emoji: accessoryRaw.emoji?.name ?? undefined,
          };
        } else if (
          accessoryRaw.type === DiscordComponentType.Button &&
          typeof accessoryRaw.panel_id === "number" &&
          accessoryRaw.custom_id === undefined &&
          accessoryRaw.url === undefined
        ) {
          accessory = { kind: "panel_button", panel_id: accessoryRaw.panel_id };
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

      // A row whose sole child is the placeholder panel-select menu (no options/custom_id of
      // its own on the wire) parses to a standalone panel_select block, not a button_row. Any
      // other select menu - a real one, or one mixed with anything else - stays unrepresentable
      // below, same as before this feature.
      if (
        children.length === 1 &&
        children[0]?.type === DiscordComponentType.StringSelect &&
        children[0]?.is_panel_select === true &&
        (children[0]?.options === undefined ||
          (Array.isArray(children[0].options) && children[0].options.length === 0))
      ) {
        return { id: newId(), type: "panel_select" };
      }

      const isLinkButton = (c: ApiComponent) =>
        c?.type === DiscordComponentType.Button &&
        c?.style === ButtonStyle.Link &&
        typeof c?.url === "string";

      // A placed panel button has no custom_id/url of its own on the wire - only panel_id.
      const isPanelButton = (c: ApiComponent) =>
        c?.type === DiscordComponentType.Button &&
        typeof c?.panel_id === "number" &&
        c?.custom_id === undefined &&
        c?.url === undefined;

      // An ActionRow that isn't entirely link-style buttons and/or placed panel buttons (e.g.
      // one of the bot's own system-appended interactive rows) isn't something this builder
      // can edit - it's rendered by the preview but never round-tripped through the
      // admin-editable tree, the same way other system-appended elements already work.
      const allRepresentable =
        children.length > 0 &&
        children.every((c: ApiComponent) => isLinkButton(c) || isPanelButton(c));
      if (!allRepresentable) return null;

      return {
        id: newId(),
        type: "button_row",
        buttons: children.map((c: ApiComponent) =>
          isPanelButton(c)
            ? { id: newId(), kind: "panel" as const, panel_id: c.panel_id }
            : {
                id: newId(),
                label: typeof c.label === "string" ? c.label : "",
                url: c.url,
                emoji: c.emoji?.name ?? undefined,
              },
        ),
      };
    }
    default:
      // Anything else (buttons/selects outside a link-only action row, an unrecognised
      // future type) is not something this builder can edit; drop it rather than crashing
      // the editor on load.
      return null;
  }
}

function seedFromContent(
  colourHex: string,
  title: string | undefined,
  body: string | undefined,
): V2Component[] {
  const content = [title, body].filter((part) => part && part.trim().length > 0).join("\n\n");
  if (!content) return [];

  return [
    {
      id: newId(),
      type: "container",
      accentColor: colourHex,
      components: [{ id: newId(), type: "text_display", content }],
    },
  ];
}

/** Seeds the button-message tree the first time an admin flips Classic -> V2. */
export function seedComponentTreeFromClassic(panel: Panel): V2Component[] {
  return seedFromContent(colourIntToHex(panel.colour || 0x5865f2), panel.title, panel.content);
}

/** Seeds the welcome-message tree the first time an admin flips Classic -> V2. */
export function seedWelcomeComponentTreeFromClassic(panel: Panel): V2Component[] {
  const welcome = panel.welcome_message;
  return seedFromContent(welcome?.colour || "#5865f2", welcome?.title, welcome?.description);
}

/**
 * True when `tree` structurally matches whatever `seedFromContent` would produce right now for
 * the given classic fields - i.e. the admin hasn't touched the tree since the toggle's silent
 * auto-seed filled it in. Used by the "Convert from classic" button to decide whether it can
 * skip the confirmation modal: an untouched auto-seed is exactly as safe to overwrite as a
 * genuinely empty tree, since there's nothing in it the admin authored themselves.
 */
export function isSeedTree(
  tree: V2Component[],
  source: { title?: string; body?: string; colourHex: string },
): boolean {
  const seed = seedFromContent(source.colourHex, source.title, source.body);
  if (seed.length !== tree.length) return false;
  if (seed.length === 0) return true;

  const seedContainer = seed[0] as V2Container;
  const treeNode = tree[0];
  if (treeNode.type !== "container") return false;
  if (treeNode.accentColor !== seedContainer.accentColor) return false;
  if (treeNode.components.length !== seedContainer.components.length) return false;
  if (treeNode.components.length === 0) return true;

  const seedChild = seedContainer.components[0];
  const treeChild = treeNode.components[0];
  if (seedChild.type !== "text_display" || treeChild.type !== "text_display") return false;
  return seedChild.content === treeChild.content;
}

/** Mirrors discord-markdown.ts's own RE_FENCE, so a heading line inside a fenced code block is
 * never mistaken for a real heading. Kept as a private copy rather than importing the original,
 * since the two files use it for entirely different purposes (markdown rendering vs. a raw
 * verbatim line scan) and sharing the export would tie their lifecycles together for no benefit. */
const RE_FENCE = /```(?:([A-Za-z0-9+#._-]*)\n)?([\s\S]*?)```\n?/g;

/**
 * Splits classic embed body text into segments on markdown heading lines (`#`/`##`/`###`),
 * without touching anything inside a fenced code block - a `# comment` in a support panel's
 * example code must never be treated as a real heading. Each returned segment is a verbatim
 * substring of `body` (never reconstructed), so links/emoji/mentions/formatting inside it are
 * never at risk of being mangled. Leading text before the first heading becomes its own segment;
 * an empty leading segment is dropped rather than returned as `""`.
 */
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

  const lines = body.split("\n");
  for (const line of lines) {
    const lineStart = cursor;
    cursor += line.length + 1; // +1 accounts for the "\n" that split() consumed.

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

/** The classic (embed-shaped) fields a "Convert from classic" call site can hand over. Every
 * field is optional, since panel button-messages carry only title/body/colour/images while
 * welcome-messages and multi-panel embeds also carry fields/author/footer. */
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
 * Deliberate, explicit "Convert from classic" decomposition - distinct from the silent
 * `seedFromContent`-based auto-seed above, which stays untouched and keeps concatenating
 * title+body into a single block. This instead splits the body on markdown headings, turns
 * images into a Media Gallery block, and folds fields/author/footer into disclosed, lossy text
 * (never silently dropped without a trace) rather than ignoring them outright.
 *
 * `maxBlocks` is the caller's real remaining budget (the surface's 30/10-block ceiling minus
 * whatever the backend reserves for system-appended buttons/dropdowns) - if the initial
 * assembly would exceed it, trailing text_display segments are folded together (rejoined with
 * "\n\n") from the end until it fits, rather than handing back a tree the budget meter would
 * immediately flag as over. The media_gallery block, if present, is never folded away.
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

/**
 * Whether a classic conversion source has anything `convertClassicToComponentsV2` would
 * actually turn into a block. Mirrors that function's own filtering - in particular, an
 * image or thumbnail URL only counts if it passes `isSafeUrl`, same as a realistic backend
 * placeholder such as `%avatar_url%` (not a parseable URL) would be silently dropped by the
 * converter. Callers should use this (rather than a bare truthiness check on the raw classic
 * fields) to decide whether the "Convert from classic" button is enabled and whether a confirm
 * modal's bullet list should mention image content, so the UI never claims there is convertible
 * content when there is not.
 */
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

/**
 * Runs a classic-to-Components-v2 conversion and applies it via `setTree`, but only if the
 * conversion actually produced something. Guards against the case where the only classic
 * content was an image/thumbnail URL that fails `isSafeUrl` (e.g. the backend's `%avatar_url%`
 * placeholder): `convertClassicToComponentsV2` correctly returns an empty tree there, and
 * without this guard a caller that called `setTree(result.tree)` unconditionally would silently
 * wipe any existing blocks after the admin confirmed a conversion they thought would succeed.
 */
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

/**
 * Mirrors the backend's countComponents (validation.go) so client and server budgets agree.
 * Note: a guild-authored ActionRow of link buttons is new territory for that function - it
 * previously only ever recursed into Container/Section because nothing else was allowed to
 * contain children. This counts the row itself plus each button (matching Discord's real
 * per-component budget), on the assumption the backend does the same; flagged to confirm.
 */
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
      // One ActionRow + one SelectMenu on the wire - matches multiPanelReserved's own
      // { topLevel: 1, total: 2 } accounting for the equivalent system-appended dropdown.
      count += 1;
    }
  }
  return count;
}

export interface ComponentBudget {
  topLevel: number;
  total: number;
}

/** Reserved for the system-appended open-ticket button row on a panel's button message. */
export const PANEL_MESSAGE_RESERVED: ComponentBudget = { topLevel: 1, total: 2 };

/** Reserved for the welcome message: a form-answer placeholder, plus close/claim buttons if visible. */
export function panelWelcomeReserved(visibleButtons: number): ComponentBudget {
  return {
    topLevel: 1 + (visibleButtons > 0 ? 1 : 0),
    total: 3 + (visibleButtons > 0 ? visibleButtons + 1 : 0),
  };
}

/**
 * Reserved for a multi-panel's system-appended panel-select buttons or dropdown.
 *
 * Placing a panel's button (or the whole dropdown) inside the tree excludes that panel from the
 * backend's auto-appended default row - so `countBlocks` and this reservation must never both
 * budget for the same panel. Callers must pass `panelCount` as the count of panels NOT already
 * placed in the tree (i.e. `panelCount - getPlacedPanelIds(tree).size`), and must pass
 * `selectMenu: false` when `hasPanelSelectBlock(tree)` is true. When `hasPanelSelectBlock(tree)`
 * is true, the backend's `unplacedPanels` (multipanelmessagedata.go) returns nil outright - the
 * whole default row is suppressed, not reduced by one, because every remaining unplaced panel is
 * absorbed into the in-tree select's own options - so callers must also pass `panelCount: 0` in
 * that case, not `panelCount - getPlacedPanelIds(tree).size`. This function cannot enforce that
 * netting itself - it has no access to the tree - so it is the page-wiring pass's responsibility.
 */
export function multiPanelReserved(opts: {
  selectMenu: boolean;
  panelCount: number;
}): ComponentBudget {
  if (opts.selectMenu) return { topLevel: 1, total: 2 };
  const rows = Math.ceil(opts.panelCount / 5);
  return { topLevel: rows, total: rows + opts.panelCount };
}

/**
 * Walks the whole tree (including nested containers/sections) and collects every panel id
 * referenced by a placed panel button, whether as a button_row entry or a Section accessory.
 * Does not include whichever panels a panel_select block would bind - a panel_select block has
 * no panel_id of its own, it always binds every currently-unplaced panel, which is derived
 * elsewhere as "whichever panels aren't in this set".
 */
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

/**
 * True iff a panel_select block exists anywhere in the tree. Only recurses into `container`
 * children (containers cannot nest, and a Section's children are plain text rows, not blocks -
 * see the comment on `locateBlock` above), which matches every place a `panel_select` block can
 * actually live. The backend also requires the multipanel to be in "dropdown mode"
 * (`select_menu`) for an `is_panel_select` node to be valid, but that flag lives outside this
 * file in the page's `multiPanel` state, so it can't be checked here - callers must enforce that
 * separately.
 */
export function hasPanelSelectBlock(tree: V2Component[]): boolean {
  return tree.some(
    (block) =>
      block.type === "panel_select" ||
      (block.type === "container" && hasPanelSelectBlock(block.components)),
  );
}

/**
 * Strips any panel_select block from the tree. Needed when an admin switches the multipanel's
 * "Use Dropdown Menu" toggle off while a placed dropdown still exists in the tree: an
 * `is_panel_select` node with `select_menu` now false is invalid on the wire and the backend
 * rejects the save with a 400, so the page calls this at the moment of the toggle flip to keep
 * the tree valid client-side rather than surfacing a confusing save-time error for something
 * entirely avoidable. Same recursion shape as `hasPanelSelectBlock` - a panel_select block can
 * only live at the top level or directly inside a container, never inside a Section.
 */
export function removePanelSelectBlock(tree: V2Component[]): V2Component[] {
  return tree
    .filter((block) => block.type !== "panel_select")
    .map((block) =>
      block.type === "container"
        ? { ...block, components: removePanelSelectBlock(block.components) }
        : block,
    );
}

// ─── Tree editing helpers ──────────────────────────────────────────────────
// Only two levels ever hold reorderable "blocks": the top-level array, and a single
// Container's `components` array (Containers cannot nest, and a Section's children are
// plain text rows edited inline, not blocks with their own chrome).

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

/**
 * True when both blocks live in the same reorderable list - either both at the top level, or
 * both inside the same Container. Used by the drag-and-drop reorder handler to reject a drop
 * that would move a block between the top-level list and a container's own list, a boundary
 * that already has dedicated UI (BlockShell's "Move into/out of container" control) and isn't
 * something a drag gesture should be able to do implicitly.
 */
export function sameList(tree: V2Component[], idA: string, idB: string): boolean {
  const locationA = locateBlock(tree, idA);
  const locationB = locateBlock(tree, idB);
  if (!locationA || !locationB) return false;
  return locationA.containerId === locationB.containerId;
}

/**
 * Finds a block anywhere in the tree (top level, or one level into a Container) and returns it
 * directly, rather than just its location - used by the drag overlay to render a preview of
 * whichever block is currently being dragged.
 */
export function findBlock(tree: V2Component[], id: string): V2Component | null {
  const location = locateBlock(tree, id);
  return location ? location.list[location.index] : null;
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

/**
 * Moves a block to an arbitrary index within its own list (drag-and-drop reordering), using
 * the same two-level locateBlock/replaceList model as moveBlock - a splice-to-index rather than
 * an adjacent-index swap. Never moves a block between lists: targetIndex is always interpreted
 * within the list the block already lives in.
 */
export function moveBlockToIndex(
  tree: V2Component[],
  id: string,
  targetIndex: number,
): V2Component[] {
  const location = locateBlock(tree, id);
  if (!location) return tree;

  const { list, index } = location;
  const clampedIndex = Math.max(0, Math.min(targetIndex, list.length - 1));
  if (clampedIndex === index) return tree;

  const nextList = [...list];
  const [moved] = nextList.splice(index, 1);
  nextList.splice(clampedIndex, 0, moved);

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

/** Moves a block out of whichever container holds it, to the top level right after that container. */
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
