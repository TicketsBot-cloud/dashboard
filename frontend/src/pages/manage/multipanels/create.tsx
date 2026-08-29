import { useEffect, useRef, useState, type FC } from "react";
import { apiClient, SKIP_ERROR_TOAST } from "@/lib/api";
import { useGuildEmojis, useGuildPanels } from "@/hooks/queries/useGuild";
import { useParams, useNavigate } from "react-router";

import { getGuildById } from "@/stores/auth";
import { toast } from "sonner";
import { MainLayout } from "@/pages/layout/Main";
import { useGuildStore } from "@/stores/guild";
import type { MultiPanelPanelEntry, MultiPanelRequest } from "@/types";
import Collapsible from "@/components/Collapsible";
import MultiSelect from "@/components/MultiSelect";
import Select from "@/components/Select";
import TextInput from "@/components/TextInput";
import ColourSelect from "@/components/ColourSelect";
import Textarea from "@/components/Textarea";
import PanelPreview from "@/components/PanelPreview";
import DateTimePicker from "@/components/DateTimePicker";
import Button from "@/components/Button";
import FeatureLockBanner from "@/components/FeatureLockBanner";
import { useFeatureLock } from "@/hooks/useFeatureLock";
import { FEATURE_PANELS } from "@/lib/feature-flags";
import { parseEmbedTimestamp, serializeEmbedTimestamp } from "@/lib/embed-timestamp";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus, faExclamationTriangle } from "@fortawesome/free-solid-svg-icons";
import Slider from "@/components/Slider";
import EmojiPicker from "@/components/EmojiPicker";
import { sortGuildChannels } from "@/lib/guild-channels";
import { PANEL_MESSAGE_INFO } from "@/constants/panelChannelInfo";
import MultiPanelInfoModal from "@/components/modals/MultiPanelInfoModal";
import { EMBED_LIMITS } from "@/constants/embedLimits";
import EmbedCharacterTotal from "@/components/EmbedCharacterTotal";
import { useApiErrorHandler } from "@/hooks/useApiErrorHandler";

type MultiPanelDraft = Omit<MultiPanelRequest, "channel_id"> & {
  channel_id?: MultiPanelRequest["channel_id"];
};

const MultiPanelsPage: FC = () => {
  const navigate = useNavigate();
  let { guildId } = useParams();
  guildId = guildId!;

  const { selectGuild, selectedGuild } = useGuildStore();

  const { locked: polledLock } = useFeatureLock(FEATURE_PANELS, guildId);
  const [forcedLock, setForcedLock] = useState(false);
  const handleApiError = useApiErrorHandler(
    "Panel management is temporarily unavailable. Please try again shortly.",
    setForcedLock,
  );
  const isLocked = forcedLock || polledLock === true;

  // Announce the lock lifting mid-session (e.g. a flag re-enabled while this page
  // is open). The banner's own aria-live region only reliably announces the
  // unlocked-to-locked transition (see FeatureLockBanner), so the reverse gets a
  // toast instead. Guarded so it never fires on mount, only on a genuine flip.
  const previousLockRef = useRef(isLocked);
  useEffect(() => {
    if (previousLockRef.current && !isLocked) {
      toast.success("Panel changes are available again.");
    }
    previousLockRef.current = isLocked;
  }, [isLocked]);

  useEffect(() => {
    // Load guild from storage to get the name and check permissions
    const guild = getGuildById(guildId);
    if (guild) {
      // Only select guild if it's not already selected or if it's a different guild
      // This prevents overwriting channels/roles/teams data that parent component fetched
      if (!selectedGuild || selectedGuild.id !== guild.id) {
        selectGuild(guild);
      }

      if (guild.permission_level < 2) {
        toast.warning(
          "You do not have permission to manage this server's panels. Please contact an administrator.",
        );
      }
    }
  }, [guildId, selectGuild, selectedGuild]);

  const sortedChannels = sortGuildChannels(selectedGuild?.channels || []);

  const [multiPanelInfoOpen, setMultiPanelInfoOpen] = useState(false);
  const [multiPanel, setMultiPanel] = useState<MultiPanelDraft>({
    embed: {
      author: {},
      colour: 0x5865f2,
      description: "",
      footer: {},
    },
    panels: [] as MultiPanelPanelEntry[],
    select_menu: false,
  });

  const getPanelById = (id: number) => panels.find((p) => p.panel_id === id);

  const getPreviewButtons = () =>
    multiPanel.panels.flatMap((entry) => {
      const p = getPanelById(entry.panel_id);
      if (!p) return [];
      const hasCustomEmoji = !!(entry.custom_emoji_name || entry.custom_emoji_id);
      const customGuildEmoji = entry.custom_emoji_id
        ? guildEmojis.find((e) => e.id === entry.custom_emoji_id)
        : undefined;
      return [
        {
          ...p,
          button_label: entry.custom_label || p.button_label,
          emote: hasCustomEmoji ? (entry.custom_emoji_name ?? "") : p.emote,
          emoji_id: hasCustomEmoji ? entry.custom_emoji_id : p.emoji_id,
          emoji_animated: customGuildEmoji
            ? (customGuildEmoji.animated ?? false)
            : p.emoji_animated,
          use_custom_emoji: hasCustomEmoji ? !!entry.custom_emoji_id : p.use_custom_emoji,
        },
      ];
    });

  const updatePanelCustomization = (
    panelId: number,
    field: keyof Omit<MultiPanelPanelEntry, "panel_id">,
    value: string | undefined,
  ) => {
    setMultiPanel((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        panels: prev.panels.map((p) =>
          p.panel_id === panelId ? { ...p, [field]: value || undefined } : p,
        ),
      };
    });
  };

  const panelNeedsLabel = (panelId: number) => {
    if (!multiPanel.select_menu) return false;
    const panel = getPanelById(panelId);
    const entry = multiPanel.panels.find((p) => p.panel_id === panelId);
    return !entry?.custom_label?.trim() && !panel?.button_label;
  };
  const validateMultiPanel = () => {
    if (!multiPanel.channel_id) {
      toast.error("Select a panel channel before creating the multi-panel.");
      return null;
    }

    if (multiPanel.panels.length < 2) {
      toast.error("Select at least two panels before creating the multi-panel.");
      return null;
    }

    if (multiPanel.panels.length > 15) {
      toast.error("Multi-panels cannot contain more than 15 panels.");
      return null;
    }

    if (
      multiPanel.select_menu &&
      multiPanel.panels.some((entry) => panelNeedsLabel(entry.panel_id))
    ) {
      toast.error("Every dropdown panel needs a label.");
      return null;
    }

    return { ...multiPanel, channel_id: multiPanel.channel_id } satisfies MultiPanelRequest;
  };
  const { data: panels = [] } = useGuildPanels(guildId);
  const { data: guildEmojis = [] } = useGuildEmojis(guildId, true);

  return (
    <MainLayout
      title={"New Multi-Panel Creation"}
      subtitle="Create a new multi panel to allow users to open tickets."
    >
      <FeatureLockBanner
        id="multipanel-lock-banner"
        locked={isLocked}
        featureLabel="Panel changes"
        existingLabel="panels"
      />
      <Collapsible
        title="Ticket Settings"
        subtitle="Configure the channel and display options"
        defaultOpen={true}
      >
        <div className="p-4 grid gap-4 grid-cols-1 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          <Select
            label="Panel Channel"
            info={PANEL_MESSAGE_INFO}
            value={multiPanel.channel_id || ""}
            options={sortedChannels}
            onChange={(e) =>
              setMultiPanel((prev) => (prev ? { ...prev, channel_id: e ?? prev.channel_id } : prev))
            }
          />
          <MultiSelect
            label="Panels"
            value={multiPanel.panels?.map((p) => p.panel_id.toString()) || []}
            options={panels?.map((panel) => ({
              label: panel.title,
              key: panel.panel_id.toString(),
              color: panel.colour.toString(16).padStart(6, "0"),
            }))}
            onChange={(e) =>
              setMultiPanel((prev) => {
                if (!prev) return prev;
                const newIds = e.map(Number);
                const existingById = Object.fromEntries(prev.panels.map((p) => [p.panel_id, p]));
                return {
                  ...prev,
                  panels: newIds.map((id) => existingById[id] ?? { panel_id: id }),
                };
              })
            }
          />
        </div>
        <div className="p-4 grid gap-4 grid-cols-1 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          <Slider
            label="Use Dropdown Menu"
            value={multiPanel.select_menu}
            onChange={(e) => setMultiPanel((prev) => (prev ? { ...prev, select_menu: e } : prev))}
            onInfoClick={() => setMultiPanelInfoOpen(true)}
          />
          <TextInput
            label="Dropdown Placeholder Text"
            placeholder="e.g. Select a category"
            value={multiPanel.select_menu_placeholder || ""}
            onChange={(e) =>
              setMultiPanel((prev) => (prev ? { ...prev, select_menu_placeholder: e } : prev))
            }
            disabled={!multiPanel.select_menu}
          />
        </div>
      </Collapsible>
      <Collapsible
        title="Panel Customization (Optional)"
        subtitle="Override appearance for individual panels"
        defaultOpen={false}
      >
        <div className="p-4 flex flex-col gap-4">
          {multiPanel.panels && multiPanel.panels.length > 0 ? (
            multiPanel.panels.map((entry) => {
              const panel = getPanelById(entry.panel_id);
              const needsLabel = panelNeedsLabel(entry.panel_id);
              return (
                <div
                  key={entry.panel_id}
                  className="flex flex-col gap-3 p-3 border border-neutral-600 rounded"
                >
                  <span className="font-semibold text-sm">
                    {panel?.title || `Panel ${entry.panel_id}`}
                  </span>
                  <EmojiPicker
                    label="Custom Emoji"
                    value={entry.custom_emoji_id ? "" : entry.custom_emoji_name || ""}
                    guildEmojiId={entry.custom_emoji_id}
                    guildEmojis={guildEmojis}
                    onChange={(v, guildEmoji) => {
                      updatePanelCustomization(
                        entry.panel_id,
                        "custom_emoji_name",
                        guildEmoji ? guildEmoji.name : v,
                      );
                      updatePanelCustomization(entry.panel_id, "custom_emoji_id", guildEmoji?.id);
                    }}
                    placeholder={
                      panel && !panel.emoji_id && panel.emoji_name
                        ? panel.emoji_name
                        : "Leave empty to use default emoji"
                    }
                  />
                  <TextInput
                    label="Custom Label"
                    placeholder={panel?.button_label || "Leave empty to use default"}
                    value={entry.custom_label || ""}
                    onChange={(v) => updatePanelCustomization(entry.panel_id, "custom_label", v)}
                  />
                  {multiPanel.select_menu && (
                    <TextInput
                      label="Description"
                      placeholder="Optional description"
                      value={entry.description || ""}
                      onChange={(v) => updatePanelCustomization(entry.panel_id, "description", v)}
                    />
                  )}
                  {needsLabel && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-red-900/30 border border-red-500/40 rounded text-red-400 text-sm">
                      <FontAwesomeIcon icon={faExclamationTriangle} />
                      <span>
                        This panel must have a label when using dropdown mode. Please add a custom
                        label or ensure the panel has a button label.
                      </span>
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <p className="text-gray-400 text-sm italic">No panels selected for customization.</p>
          )}
        </div>
      </Collapsible>
      <Collapsible
        title="Panel Settings"
        subtitle="Configure the embed's appearance"
        defaultOpen={true}
      >
        <div className="px-4 grid gap-4 grid-cols-1 sm:grid-cols-1 md:grid-cols-2">
          <div className="pb-2 mb-5">
            <span className="text-xl font-semibold">Panel Properties</span>
            <div className="pt-2 grid gap-2 grid-cols-1 md:grid-cols-2">
              <TextInput
                label="Title"
                placeholder="e.g. Open a ticket"
                value={multiPanel.embed.title || ""}
                onChange={(e) =>
                  setMultiPanel((prev) =>
                    prev ? { ...prev, embed: { ...prev.embed, title: e } } : prev,
                  )
                }
                maxLength={EMBED_LIMITS.TITLE}
                showCount
              />
              <ColourSelect
                label="Colour"
                value={
                  multiPanel.embed?.colour
                    ? `#${multiPanel.embed.colour.toString(16).padStart(6, "0")}`
                    : "#5865f2"
                }
                onChange={(e) =>
                  setMultiPanel((prev) =>
                    prev
                      ? {
                          ...prev,
                          embed: {
                            ...prev.embed,
                            colour: parseInt(e.replace("#", ""), 16),
                          },
                        }
                      : prev,
                  )
                }
              />
            </div>
            <div className="py-2">
              <Textarea
                label="Description"
                value={multiPanel.embed?.description || ""}
                onChange={(e) =>
                  setMultiPanel((prev) =>
                    prev ? { ...prev, embed: { ...prev.embed, description: e } } : prev,
                  )
                }
                max={EMBED_LIMITS.DESCRIPTION}
              />
            </div>

            <Collapsible title="" subtitle="Author Settings" defaultOpen={false}>
              <TextInput
                label="Author Name"
                placeholder="e.g. Support Team"
                value={multiPanel.embed?.author?.name || ""}
                onChange={(e) =>
                  setMultiPanel((prev) =>
                    prev
                      ? {
                          ...prev,
                          embed: {
                            ...prev.embed,
                            author: { ...prev.embed?.author, name: e },
                          },
                        }
                      : prev,
                  )
                }
                maxLength={EMBED_LIMITS.AUTHOR_NAME}
                showCount
              />
              <div className="pt-2 grid gap-2 grid-cols-1 md:grid-cols-2">
                <TextInput
                  label="Author Icon URL"
                  placeholder="e.g. https://example.com/icon.png"
                  value={multiPanel.embed?.author?.icon_url || ""}
                  onChange={(e) =>
                    setMultiPanel((prev) =>
                      prev
                        ? {
                            ...prev,
                            embed: {
                              ...prev.embed,
                              author: { ...prev.embed?.author, icon_url: e },
                            },
                          }
                        : prev,
                    )
                  }
                  maxLength={EMBED_LIMITS.URL}
                />
                <TextInput
                  label="Author URL"
                  placeholder="e.g. https://example.com"
                  value={multiPanel.embed?.author?.url || ""}
                  onChange={(e) =>
                    setMultiPanel((prev) =>
                      prev
                        ? {
                            ...prev,
                            embed: {
                              ...prev.embed,
                              author: { ...prev.embed?.author, url: e },
                            },
                          }
                        : prev,
                    )
                  }
                  maxLength={EMBED_LIMITS.URL}
                />
              </div>
            </Collapsible>
            <Collapsible title="" subtitle="Images" defaultOpen={false}>
              <TextInput
                label="Thumbnail URL"
                placeholder="e.g. https://example.com/thumbnail.png"
                value={multiPanel.embed?.thumbnail_url || ""}
                onChange={(e) =>
                  setMultiPanel((prev) =>
                    prev
                      ? {
                          ...prev,
                          embed: { ...prev.embed, thumbnail_url: e },
                        }
                      : prev,
                  )
                }
                maxLength={EMBED_LIMITS.URL}
              />
              <TextInput
                label="Image URL"
                placeholder="e.g. https://example.com/image.png"
                value={multiPanel.embed?.image_url || ""}
                onChange={(e) =>
                  setMultiPanel((prev) =>
                    prev ? { ...prev, embed: { ...prev.embed, image_url: e } } : prev,
                  )
                }
                maxLength={EMBED_LIMITS.URL}
              />
            </Collapsible>
            <Collapsible title="" subtitle="Footer Settings" defaultOpen={false}>
              <Textarea
                label="Footer Text"
                placeholder="e.g. Powered by TicketBot"
                value={multiPanel.embed?.footer?.text || ""}
                onChange={(e) =>
                  setMultiPanel((prev) =>
                    prev
                      ? {
                          ...prev,
                          embed: {
                            ...prev.embed,
                            footer: { ...prev.embed?.footer, text: e },
                          },
                        }
                      : prev,
                  )
                }
                max={EMBED_LIMITS.FOOTER_TEXT}
              />
              <TextInput
                label="Footer Icon URL"
                placeholder="e.g. https://example.com/footer-icon.png"
                value={multiPanel.embed?.footer?.icon_url || ""}
                onChange={(e) =>
                  setMultiPanel((prev) =>
                    prev
                      ? {
                          ...prev,
                          embed: {
                            ...prev.embed,
                            footer: { ...prev.embed?.footer, icon_url: e },
                          },
                        }
                      : prev,
                  )
                }
                maxLength={EMBED_LIMITS.URL}
              />
              <DateTimePicker
                label="Footer Timestamp (Optional)"
                value={parseEmbedTimestamp(multiPanel.embed?.timestamp)}
                onChange={(date) =>
                  setMultiPanel((prev) =>
                    prev
                      ? {
                          ...prev,
                          embed: { ...prev.embed, timestamp: serializeEmbedTimestamp(date) },
                        }
                      : prev,
                  )
                }
              />
            </Collapsible>
            <EmbedCharacterTotal embed={multiPanel.embed} />
          </div>

          <div>
            <span className="text-xl font-semibold">Panel Preview</span>
            <PanelPreview
              type="welcome"
              data={{ panel: multiPanel, buttons: getPreviewButtons() }}
            />
          </div>
        </div>
      </Collapsible>
      <Button
        variant="success"
        className="mt-4 text-sm font-medium"
        visuallyDisabled={isLocked}
        aria-describedby={isLocked ? "multipanel-lock-banner" : undefined}
        onClick={async () => {
          const payload = validateMultiPanel();
          if (!payload) return;

          try {
            await apiClient.multiPanels.create(guildId, payload, SKIP_ERROR_TOAST);
            toast.success("Multi Panel Created");
            navigate(`/manage/${guildId}/panels`);
          } catch (error) {
            handleApiError(error, "Failed to create multi panel. Please try again.");
            console.error("Failed to create multi panel:", error);
          }
        }}
      >
        <FontAwesomeIcon icon={faPlus} className="mr-2" /> Create Multi Panel
      </Button>
      <MultiPanelInfoModal
        isOpen={multiPanelInfoOpen}
        onClose={() => setMultiPanelInfoOpen(false)}
      />
    </MainLayout>
  );
};

export default MultiPanelsPage;
