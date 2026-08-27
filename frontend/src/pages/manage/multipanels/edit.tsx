import { useEffect, useRef, useState, type FC } from "react";
import { apiClient, SKIP_ERROR_TOAST } from "@/lib/api";
import { useGuildEmojis, useGuildPanels } from "@/hooks/queries/useGuild";
import { useParams, useNavigate } from "react-router";

import { getGuildById } from "@/stores/auth";
import { toast } from "sonner";
import { MainLayout } from "@/pages/layout/Main";
import { useGuildStore } from "@/stores/guild";
import type { MultiPanel, MultiPanelPanelEntry } from "@/types";
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
import { faSave, faExclamationTriangle } from "@fortawesome/free-solid-svg-icons";
import Slider from "@/components/Slider";
import EmojiPicker from "@/components/EmojiPicker";
import { sortGuildChannels } from "@/lib/guild-channels";
import { PANEL_MESSAGE_INFO } from "@/constants/panelChannelInfo";
import MultiPanelInfoModal from "@/components/modals/MultiPanelInfoModal";

const defaultEmbed = {
  author: {},
  colour: 0x5865f2,
  footer: {},
};

const MultiPanelsPage: FC = () => {
  const navigate = useNavigate();
  let { guildId, panelId } = useParams();
  guildId = guildId!;
  panelId = panelId!;

  const { selectGuild, selectedGuild } = useGuildStore();

  const { locked: polledLock } = useFeatureLock(FEATURE_PANELS, guildId);
  const [forcedLock, setForcedLock] = useState(false);
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
  const [multiPanel, setMultiPanel] = useState<MultiPanel | null>(null);
  const { data: panels = [] } = useGuildPanels(guildId);
  const { data: guildEmojis = [] } = useGuildEmojis(guildId, true);

  const getPanelById = (id: number) => panels.find((p) => p.panel_id === id);

  const getPreviewButtons = () =>
    (multiPanel?.panels ?? []).flatMap((entry) => {
      const p = getPanelById(entry.panel_id);
      if (!p) return [];
      const customEmojiName = entry.custom_emoji_name || undefined;
      const customEmojiId =
        entry.custom_emoji_id && entry.custom_emoji_id !== "null"
          ? entry.custom_emoji_id
          : undefined;
      const hasCustomEmoji = !!(customEmojiName || customEmojiId);
      const customGuildEmoji = customEmojiId
        ? guildEmojis.find((e) => e.id === customEmojiId)
        : undefined;
      return [
        {
          ...p,
          button_label: entry.custom_label || p.button_label,
          emote: hasCustomEmoji ? (customEmojiName ?? "") : p.emote,
          emoji_id: hasCustomEmoji ? customEmojiId : p.emoji_id,
          emoji_animated: customGuildEmoji
            ? (customGuildEmoji.animated ?? false)
            : p.emoji_animated,
          use_custom_emoji: hasCustomEmoji ? !!customEmojiId : p.use_custom_emoji,
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
    if (!multiPanel?.select_menu) return false;
    const panel = getPanelById(panelId);
    const entry = multiPanel?.panels.find((p) => p.panel_id === panelId);
    return !entry?.custom_label?.trim() && !panel?.button_label;
  };

  useEffect(() => {
    const fetchMultiPanel = async () => {
      try {
        const res = await apiClient.multiPanels.getById(guildId, panelId);
        setMultiPanel({ ...res.data.data, embed: res.data.data.embed ?? defaultEmbed });
      } catch (error) {
        console.error("Failed to fetch multi panel:", error);
      }
    };

    fetchMultiPanel();
  }, [guildId, panelId]);

  return (
    <MainLayout
      title="Edit Multi-Panel"
      subtitle="Update this multi-panel's ticket settings and display options."
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
            value={multiPanel?.channel_id || ""}
            options={sortedChannels}
            onChange={(e) =>
              setMultiPanel((prev) => (prev ? { ...prev, channel_id: e ?? prev.channel_id } : prev))
            }
          />
          <MultiSelect
            label="Panels"
            value={multiPanel?.panels?.map((p) => p.panel_id.toString()) || []}
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
            value={multiPanel?.select_menu ?? false}
            onChange={(e) => setMultiPanel((prev) => (prev ? { ...prev, select_menu: e } : prev))}
            onInfoClick={() => setMultiPanelInfoOpen(true)}
          />
          <TextInput
            label="Dropdown Placeholder Text"
            placeholder="e.g. Select a category"
            value={multiPanel?.select_menu_placeholder || ""}
            onChange={(e) =>
              setMultiPanel((prev) => (prev ? { ...prev, select_menu_placeholder: e } : prev))
            }
            disabled={!multiPanel?.select_menu}
          />
        </div>
      </Collapsible>
      <Collapsible
        title="Panel Customization (Optional)"
        subtitle="Override appearance for individual panels"
        defaultOpen={false}
      >
        <div className="p-4 flex flex-col gap-4">
          {multiPanel && multiPanel.panels && multiPanel.panels.length > 0 ? (
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
                value={multiPanel?.embed.title || ""}
                onChange={(e) =>
                  setMultiPanel((prev) =>
                    prev ? { ...prev, embed: { ...prev.embed, title: e } } : prev,
                  )
                }
              />
              <ColourSelect
                label="Colour"
                value={
                  multiPanel?.embed?.colour
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
                value={multiPanel?.embed?.description || ""}
                onChange={(e) =>
                  setMultiPanel((prev) =>
                    prev ? { ...prev, embed: { ...prev.embed, description: e } } : prev,
                  )
                }
                max={1000}
              />
            </div>

            <Collapsible title="" subtitle="Author Settings" defaultOpen={false}>
              <TextInput
                label="Author Name"
                placeholder="e.g. Support Team"
                value={multiPanel?.embed?.author?.name || ""}
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
              />
              <div className="pt-2 grid gap-2 grid-cols-1 md:grid-cols-2">
                <TextInput
                  label="Author Icon URL"
                  placeholder="e.g. https://example.com/icon.png"
                  value={multiPanel?.embed?.author?.icon_url || ""}
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
                />
                <TextInput
                  label="Author URL"
                  placeholder="e.g. https://example.com"
                  value={multiPanel?.embed?.author?.url || ""}
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
                />
              </div>
            </Collapsible>
            <Collapsible title="" subtitle="Images" defaultOpen={false}>
              <TextInput
                label="Thumbnail URL"
                placeholder="e.g. https://example.com/thumbnail.png"
                value={multiPanel?.embed?.thumbnail_url || ""}
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
              />
              <TextInput
                label="Image URL"
                placeholder="e.g. https://example.com/image.png"
                value={multiPanel?.embed?.image_url || ""}
                onChange={(e) =>
                  setMultiPanel((prev) =>
                    prev ? { ...prev, embed: { ...prev.embed, image_url: e } } : prev,
                  )
                }
              />
            </Collapsible>
            <Collapsible title="" subtitle="Footer Settings" defaultOpen={false}>
              <TextInput
                label="Footer Text"
                placeholder="e.g. Powered by TicketBot"
                value={multiPanel?.embed?.footer?.text || ""}
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
              />
              <TextInput
                label="Footer Icon URL"
                placeholder="e.g. https://example.com/footer-icon.png"
                value={multiPanel?.embed?.footer?.icon_url || ""}
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
              />
              <DateTimePicker
                label="Footer Timestamp (Optional)"
                value={parseEmbedTimestamp(multiPanel?.embed?.timestamp)}
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
          </div>

          <div>
            <span className="text-xl font-semibold">Panel Preview</span>
            {multiPanel && (
              <PanelPreview
                type="welcome"
                data={{ panel: multiPanel, buttons: getPreviewButtons() }}
              />
            )}
          </div>
        </div>
      </Collapsible>
      <Button
        variant="success"
        className="mt-4 text-sm font-medium"
        visuallyDisabled={isLocked}
        aria-describedby={isLocked ? "multipanel-lock-banner" : undefined}
        onClick={async () => {
          if (!multiPanel) return;
          try {
            await apiClient.multiPanels.update(guildId, panelId, multiPanel, SKIP_ERROR_TOAST);
            toast.success("Multi Panel Edited");
            navigate(`/manage/${guildId}/panels`);
          } catch (error) {
            const status = (error as { response?: { status?: number } })?.response?.status;
            const apiError = (error as { response?: { data?: { error?: string } } })?.response?.data
              ?.error;
            if (status === 503) {
              toast.warning(
                apiError ??
                  "Panel management is temporarily unavailable. Please try again shortly.",
              );
              setForcedLock(true);
            } else {
              // SKIP_ERROR_TOAST opts out of the interceptor's toast for every
              // status, not just 503, so every other failure needs its own here.
              toast.error(apiError ?? "Failed to save multi panel. Please try again.");
            }
            console.error("Failed to edit multi panel:", error);
          }
        }}
      >
        <FontAwesomeIcon icon={faSave} className="mr-2" /> Save Changes
      </Button>
      <MultiPanelInfoModal
        isOpen={multiPanelInfoOpen}
        onClose={() => setMultiPanelInfoOpen(false)}
      />
    </MainLayout>
  );
};

export default MultiPanelsPage;
