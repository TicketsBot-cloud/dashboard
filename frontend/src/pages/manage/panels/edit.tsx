import { useCallback, useEffect, useRef, useState, type FC } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiClient, SKIP_ERROR_TOAST } from "@/lib/api";
import {
  guildKeys,
  useGuildEmojis,
  useGuildForms,
  useGuildPanel,
  useGuildPremium,
} from "@/hooks/queries/useGuild";
import { useKBCategories } from "@/hooks/queries/useKB";
import { useParams, useNavigate } from "react-router";

import { getGuildById } from "@/stores/auth";
import { toast } from "sonner";
import { MainLayout } from "@/pages/layout/Main";
import { useGuildStore } from "@/stores/guild";
import type { Panel, SupportHoursData } from "@/types";
import Collapsible from "@/components/Collapsible";
import MultiSelect from "@/components/MultiSelect";
import Select from "@/components/Select";
import TextInput from "@/components/TextInput";
import NumberInput from "@/components/NumberInput";
import ColourSelect from "@/components/ColourSelect";
import Textarea from "@/components/Textarea";
import EmojiPicker from "@/components/EmojiPicker";
import PanelPreview from "@/components/PanelPreview";
import Slider from "@/components/Slider";
import DurationPicker from "@/components/DurationPicker";
import SupportHoursForm from "@/components/SupportHoursForm";
import AccessControlListEditor from "@/components/AccessControlListEditor";
import EmbedFieldsEditor from "@/components/EmbedFieldsEditor";
import DateTimePicker from "@/components/DateTimePicker";
import Button from "@/components/Button";
import FeatureLockBanner from "@/components/FeatureLockBanner";
import { parseEmbedTimestamp, serializeEmbedTimestamp } from "@/lib/embed-timestamp";
import { panelEmoteName, preparePanelForApi } from "@/lib/panel-payload";
import { FEATURE_PANELS } from "@/lib/feature-flags";
import PremiumGate from "@/components/PremiumGate";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSave, faTrash, faCrown } from "@fortawesome/free-solid-svg-icons";
import { sortGuildChannels } from "@/lib/guild-channels";
import {
  PANEL_MESSAGE_INFO,
  THREAD_NOTIFICATION_CHANNEL_INFO,
  TRANSCRIPT_CHANNEL_INFO,
} from "@/constants/panelChannelInfo";
import TicketModeInfoModal from "@/components/modals/TicketModeInfoModal";
import { useFeatureLock } from "@/hooks/useFeatureLock";

const PRESET_NAMING_SCHEMES = [
  "ticket-%id%",
  "ticket-%username%",
  "ticket-%id%-%username%",
  "ticket-%nickname%",
  "ticket-%id_padded%",
];

const EditPanelsPage: FC = () => {
  const navigate = useNavigate();
  let { guildId, panelId } = useParams();
  guildId = guildId!;
  panelId = panelId!;

  const { selectGuild, selectedGuild } = useGuildStore();
  const queryClient = useQueryClient();
  const { data: forms = [] } = useGuildForms(guildId);
  const { data: premiumState = null } = useGuildPremium(guildId, false);
  const { data: kbCategories = [] } = useKBCategories(guildId);
  const { data: guildEmojis = [] } = useGuildEmojis(guildId, true);
  const { data: panelData, isLoading: isLoadingPanel } = useGuildPanel(guildId, panelId);
  const [supportHours, setSupportHours] = useState<SupportHoursData | null>(null);
  const [initialSupportHours, setInitialSupportHours] = useState<SupportHoursData | null>(null);
  const [isLoadingSupportHours, setIsLoadingSupportHours] = useState(true);
  const handleSupportHoursChange = useCallback((data: SupportHoursData | null) => {
    setSupportHours(data);
  }, []);

  useEffect(() => {
    const guild = getGuildById(guildId);
    if (guild) {
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
  const existingChannelIds = new Set((selectedGuild?.channels ?? []).map((c) => c.id));

  const [panel, setPanel] = useState<Panel | null>(null);
  const [ticketModeInfoOpen, setTicketModeInfoOpen] = useState(false);
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
    if (!panelData) return;

    if (panelData.force_disabled) {
      toast.warning(
        "This panel is disabled because your server is over the free panel limit. Reactivate premium or remove another panel to edit it.",
      );
      navigate(`/manage/${guildId}/panels`);
      return;
    }

    setPanel(panelData);
  }, [panelData, guildId, navigate]);

  useEffect(() => {
    const fetchSupportHours = async () => {
      setIsLoadingSupportHours(true);
      try {
        const res = await apiClient.panels.getSupportHours(guildId, panelId);
        if (res.data && res.data.hours && res.data.hours.length > 0) {
          setSupportHours(res.data);
          setInitialSupportHours(res.data);
        }
      } catch {
        // No support hours configured - that's fine
      } finally {
        setIsLoadingSupportHours(false);
      }
    };

    fetchSupportHours();
  }, [guildId, panelId]);

  if (isLoadingPanel || isLoadingSupportHours || !panel) {
    return (
      <MainLayout
        title="Panel Editor - Loading..."
        subtitle="Edit the panel to allow users to open tickets."
      >
        <FeatureLockBanner
          id="panel-lock-banner"
          locked={isLocked}
          featureLabel="Panel changes"
          existingLabel="panels"
        />
        <div className="flex justify-center items-center h-64">
          <span className="text-gray-500">Loading panel data...</span>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout
      title={`Panel Editor - ${panel.title}`}
      subtitle="Edit the panel to allow users to open tickets."
    >
      <FeatureLockBanner
        id="panel-lock-banner"
        locked={isLocked}
        featureLabel="Panel changes"
        existingLabel="panels"
      />
      <Collapsible
        title="Panel Appearance"
        subtitle="Configure the panel's appearance"
        defaultOpen={true}
      >
        <div className="px-4 grid gap-4 grid-cols-1 sm:grid-cols-1 md:grid-cols-2">
          <div className="pb-2">
            <span className="text-xl font-semibold">Panel Properties</span>
            <div className="pt-2 grid gap-2 grid-cols-1 md:grid-cols-2">
              <TextInput
                label="Panel Title"
                placeholder="e.g. Open a ticket"
                value={panel.title || ""}
                onChange={(e) => setPanel((prev) => (prev ? { ...prev, title: e } : prev))}
              />
              <ColourSelect
                label="Panel Colour"
                value={`#${(panel.colour || 0x5865f2).toString(16).padStart(6, "0")}`}
                onChange={(e) =>
                  setPanel((prev) =>
                    prev ? { ...prev, colour: parseInt(e.replace("#", ""), 16) } : prev,
                  )
                }
              />
            </div>
            <div className="py-2">
              <Textarea
                label="Panel Content"
                value={panel.content || ""}
                onChange={(e) => setPanel((prev) => (prev ? { ...prev, content: e } : prev))}
                max={1000}
              />
            </div>
            <div className="py-2">
              <Select
                label="Panel Channel"
                info={PANEL_MESSAGE_INFO}
                error={!!panel.channel_id && !existingChannelIds.has(panel.channel_id)}
                options={sortedChannels}
                value={panel.channel_id || ""}
                onChange={(e) =>
                  setPanel((prev) => (prev ? { ...prev, channel_id: e ?? prev.channel_id } : prev))
                }
              />
            </div>
            <div className="py-2">
              <Slider
                label="Disable Panel"
                value={panel.disabled}
                onChange={(e) => setPanel((prev) => (prev ? { ...prev, disabled: e } : prev))}
              />
            </div>
            <div className="py-2">
              <TextInput
                label="Thumbnail URL"
                placeholder="e.g. https://example.com/thumbnail.png"
                value={panel.thumbnail_url || ""}
                onChange={(e) => setPanel((prev) => (prev ? { ...prev, thumbnail_url: e } : prev))}
              />
              <TextInput
                label="Image URL"
                placeholder="e.g. https://example.com/image.png"
                value={panel.image_url || ""}
                onChange={(e) => setPanel((prev) => (prev ? { ...prev, image_url: e } : prev))}
              />
            </div>
            <div className="py-2 grid gap-2 grid-cols-1 md:grid-cols-2">
              <TextInput
                label="Button Text"
                placeholder="e.g. Open Ticket"
                value={panel.button_label || ""}
                onChange={(e) => setPanel((prev) => (prev ? { ...prev, button_label: e } : prev))}
              />
              <Select
                label="Button Colour"
                value={panel.button_style?.toString() || "1"}
                options={[
                  { label: "Blue", key: "1" },
                  { label: "Grey", key: "2" },
                  { label: "Green", key: "3" },
                  { label: "Red", key: "4" },
                ]}
                onChange={(e) =>
                  setPanel((prev) =>
                    prev ? { ...prev, button_style: e ?? prev.button_style } : prev,
                  )
                }
                hideSearch
              />

              <EmojiPicker
                label="Button Emoji"
                className="col-span-2"
                value={panel.use_custom_emoji ? "" : panelEmoteName(panel.emote)}
                guildEmojiId={panel.use_custom_emoji ? panel.emoji_id : undefined}
                guildEmojis={guildEmojis}
                onChange={(v, guildEmoji) =>
                  setPanel((prev) =>
                    prev
                      ? {
                          ...prev,
                          emote: guildEmoji ? guildEmoji.name : v,
                          emoji_name: guildEmoji ? guildEmoji.name : v,
                          emoji_id: guildEmoji?.id,
                          emoji_animated: guildEmoji?.animated ?? false,
                          use_custom_emoji: !!guildEmoji,
                        }
                      : prev,
                  )
                }
              />
            </div>
          </div>

          <div>
            <span className="text-xl font-semibold">Panel Preview</span>
            <PanelPreview type="panel" data={{ panel, buttons: [panel] }} />
          </div>
        </div>
      </Collapsible>
      <Collapsible
        title="Routing"
        subtitle="Configure team assignments, categories, and notifications"
        defaultOpen={true}
      >
        <div className="p-4 grid gap-4 grid-cols-1 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          <MultiSelect
            className="z-100"
            label="Support Teams"
            placeholder="Select teams..."
            value={
              panel?.teams
                ? panel.default_team
                  ? ["Default", ...panel.teams.map(String)]
                  : panel.teams.map(String)
                : []
            }
            options={
              selectedGuild?.teams
                ? [
                    { label: "Default", key: "Default" },
                    ...(selectedGuild.teams.map((team) => ({
                      label: team.name,
                      key: team.id.toString(),
                    })) || []),
                  ]
                : [{ label: "Default", key: "Default" }]
            }
            onChange={(e) =>
              setPanel((prev) =>
                prev
                  ? {
                      ...prev,
                      teams: e.filter((t) => t !== "Default").map((t) => Number(t)),
                      default_team: e.includes("Default"),
                    }
                  : prev,
              )
            }
          />

          <MultiSelect
            className="z-100"
            label="Knowledge Base Categories"
            placeholder="Select categories..."
            value={(panel?.kb_category_ids ?? []).map(String)}
            options={kbCategories.map((cat) => ({
              label: cat.emoji ? `${cat.emoji} ${cat.name}` : cat.name,
              key: cat.id.toString(),
            }))}
            onChange={(e) =>
              setPanel((prev) =>
                prev ? { ...prev, kb_category_ids: e.map((v) => Number(v)) } : prev,
              )
            }
          />

          <Select
            label="Ticket Category"
            error={!!panel.category_id && !existingChannelIds.has(panel.category_id)}
            options={
              selectedGuild?.channels
                ?.filter((c) => c.type == 4)
                .map((channel) => ({
                  label: channel.name,
                  key: channel.id,
                })) || []
            }
            value={panel.category_id || ""}
            onChange={(e) =>
              setPanel((prev) => (prev ? { ...prev, category_id: e ?? prev.category_id } : prev))
            }
          />

          <Select
            label={
              premiumState?.premium
                ? "Awaiting Response Category"
                : "Awaiting Response Category (Premium)"
            }
            disabled={!premiumState?.premium}
            options={
              selectedGuild?.channels
                ?.filter((c) => c.type == 4)
                .map((channel) => ({
                  label: channel.name,
                  key: channel.id,
                })) || []
            }
            value={panel.pending_category || ""}
            onChange={(e) =>
              setPanel((prev) => (prev ? { ...prev, pending_category: e ?? undefined } : prev))
            }
          />
        </div>
        <div className="p-4 grid gap-4 grid-cols-1 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          <Select
            label="Transcript Channel"
            info={TRANSCRIPT_CHANNEL_INFO}
            error={
              !!panel.transcript_channel_id && !existingChannelIds.has(panel.transcript_channel_id)
            }
            showNoneOption={true}
            noneOptionLabel="No Transcript Channel"
            options={sortedChannels}
            value={panel.transcript_channel_id ?? null}
            onChange={(e) =>
              setPanel((prev) => (prev ? { ...prev, transcript_channel_id: e ?? undefined } : prev))
            }
          />

          <MultiSelect
            className="z-100"
            label="Mention On Open"
            placeholder="Select roles..."
            value={panel?.mentions || []}
            options={
              selectedGuild?.roles
                ? [
                    { label: "Ticket Opener", key: "user", color: "ffffff" },
                    { label: "@here", key: "here", color: "ffffff" },
                    ...(selectedGuild.roles.map((role) => ({
                      label: role.name,
                      key: role.id,
                      color: role.color.toString(16),
                    })) || [{ label: "@here", key: "here", color: "ffffff" }]),
                  ]
                : [{ label: "@here", key: "here", color: "ffffff" }]
            }
            onChange={(e) => setPanel((prev) => (prev ? { ...prev, mentions: e } : prev))}
          />

          <Select
            label="Mentions Behaviour"
            options={[
              { label: "Do Nothing", key: "none" },
              { label: "Hide Mentions", key: "hide" },
              { label: "Delete Mentions", key: "delete" },
            ]}
            value={panel.mention_behaviour || "none"}
            onChange={(e) =>
              setPanel((prev) =>
                prev ? { ...prev, mention_behaviour: e ?? prev.mention_behaviour } : prev,
              )
            }
            hideSearch
          />
        </div>
        <div className="p-4 grid gap-4 grid-cols-1 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          <Select
            label="Form"
            showNoneOption={true}
            options={
              forms.map((form) => ({
                label: form.title,
                key: form.form_id.toString(),
              })) || []
            }
            value={panel.form_id?.toString() ?? null}
            onChange={(e) =>
              setPanel((prev) => (prev ? { ...prev, form_id: e ? Number(e) : null } : prev))
            }
          />
          <Slider
            label="Enable Transcripts"
            value={panel.store_transcripts}
            onChange={(e) => setPanel((prev) => (prev ? { ...prev, store_transcripts: e } : prev))}
          />
        </div>
      </Collapsible>
      <Collapsible
        title="Welcome Message"
        subtitle="Configure the message sent on ticket open"
        defaultOpen={false}
      >
        <div className="px-4 grid gap-4 grid-cols-1 sm:grid-cols-1 md:grid-cols-2">
          <div className="pb-2 mb-5">
            <span className="text-xl font-semibold">Welcome Message Properties</span>
            <div className="pt-2 grid gap-2 grid-cols-1 md:grid-cols-2">
              <TextInput
                label="Title"
                placeholder="e.g. Open a ticket"
                value={panel.welcome_message?.title || ""}
                onChange={(e) =>
                  setPanel((prev) =>
                    prev
                      ? { ...prev, welcome_message: { ...prev.welcome_message, title: e } }
                      : prev,
                  )
                }
              />
              <ColourSelect
                label="Colour"
                value={`${panel.welcome_message?.colour || "#5865f2"}`}
                onChange={(e) =>
                  setPanel((prev) =>
                    prev
                      ? {
                          ...prev,
                          welcome_message: {
                            ...prev.welcome_message,
                            colour: e,
                          },
                        }
                      : prev,
                  )
                }
              />
            </div>
            <div className="py-2">
              <TextInput
                label="Title URL"
                placeholder="e.g. https://example.com"
                value={panel.welcome_message?.url || ""}
                onChange={(e) =>
                  setPanel((prev) =>
                    prev ? { ...prev, welcome_message: { ...prev.welcome_message, url: e } } : prev,
                  )
                }
              />
            </div>
            <div className="py-2">
              <Textarea
                label="Description"
                value={panel.welcome_message?.description || ""}
                onChange={(e) =>
                  setPanel((prev) =>
                    prev
                      ? { ...prev, welcome_message: { ...prev.welcome_message, description: e } }
                      : prev,
                  )
                }
                max={1000}
              />
            </div>

            <Collapsible title="" subtitle="Author Settings" defaultOpen={false}>
              <TextInput
                label="Author Name"
                placeholder="e.g. Support Team"
                value={panel.welcome_message?.author?.name || ""}
                onChange={(e) =>
                  setPanel((prev) =>
                    prev
                      ? {
                          ...prev,
                          welcome_message: {
                            ...prev.welcome_message,
                            author: { ...prev.welcome_message?.author, name: e },
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
                  value={panel.welcome_message?.author?.icon_url || ""}
                  onChange={(e) =>
                    setPanel((prev) =>
                      prev
                        ? {
                            ...prev,
                            welcome_message: {
                              ...prev.welcome_message,
                              author: { ...prev.welcome_message?.author, icon_url: e },
                            },
                          }
                        : prev,
                    )
                  }
                />
                <TextInput
                  label="Author URL"
                  placeholder="e.g. https://example.com"
                  value={panel.welcome_message?.author?.url || ""}
                  onChange={(e) =>
                    setPanel((prev) =>
                      prev
                        ? {
                            ...prev,
                            welcome_message: {
                              ...prev.welcome_message,
                              author: { ...prev.welcome_message?.author, url: e },
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
                value={panel.welcome_message?.thumbnail_url || ""}
                onChange={(e) =>
                  setPanel((prev) =>
                    prev
                      ? {
                          ...prev,
                          welcome_message: { ...prev.welcome_message, thumbnail_url: e },
                        }
                      : prev,
                  )
                }
              />
              <TextInput
                label="Image URL"
                placeholder="e.g. https://example.com/image.png"
                value={panel.welcome_message?.image_url || ""}
                onChange={(e) =>
                  setPanel((prev) =>
                    prev
                      ? { ...prev, welcome_message: { ...prev.welcome_message, image_url: e } }
                      : prev,
                  )
                }
              />
            </Collapsible>
            <Collapsible title="" subtitle="Footer Settings" defaultOpen={false}>
              <TextInput
                label="Footer Text"
                placeholder="e.g. Powered by TicketBot"
                value={panel.welcome_message?.footer?.text || ""}
                onChange={(e) =>
                  setPanel((prev) =>
                    prev
                      ? {
                          ...prev,
                          welcome_message: {
                            ...prev.welcome_message,
                            footer: { ...prev.welcome_message?.footer, text: e },
                          },
                        }
                      : prev,
                  )
                }
              />
              <TextInput
                label="Footer Icon URL"
                placeholder="e.g. https://example.com/footer-icon.png"
                value={panel.welcome_message?.footer?.icon_url || ""}
                onChange={(e) =>
                  setPanel((prev) =>
                    prev
                      ? {
                          ...prev,
                          welcome_message: {
                            ...prev.welcome_message,
                            footer: { ...prev.welcome_message?.footer, icon_url: e },
                          },
                        }
                      : prev,
                  )
                }
              />
              <DateTimePicker
                label="Footer Timestamp (Optional)"
                value={parseEmbedTimestamp(panel.welcome_message?.timestamp)}
                onChange={(date) =>
                  setPanel((prev) =>
                    prev
                      ? {
                          ...prev,
                          welcome_message: {
                            ...prev.welcome_message,
                            timestamp: serializeEmbedTimestamp(date),
                          },
                        }
                      : prev,
                  )
                }
              />
            </Collapsible>
            <Collapsible title="" subtitle="Embed Fields" defaultOpen={false}>
              <EmbedFieldsEditor
                fields={panel.welcome_message?.fields || []}
                onChange={(fields) =>
                  setPanel((prev) =>
                    prev ? { ...prev, welcome_message: { ...prev.welcome_message, fields } } : prev,
                  )
                }
              />
            </Collapsible>
          </div>

          <div>
            <span className="text-xl font-semibold">Welcome Message Preview</span>
            <PanelPreview type="welcome" data={{ panel }} />
          </div>
        </div>
      </Collapsible>
      <Collapsible
        title="Ticket Behaviour"
        subtitle="Thread, naming, overflow, and rate limit settings"
        defaultOpen={false}
      >
        <div className="p-4 grid gap-4 grid-cols-1 md:grid-cols-2">
          <Slider
            label="Create Tickets as Threads"
            value={panel.use_threads}
            onChange={(e) => setPanel((prev) => (prev ? { ...prev, use_threads: e } : prev))}
            onInfoClick={() => setTicketModeInfoOpen(true)}
          />
          <Select
            label="Thread Notification Channel"
            info={THREAD_NOTIFICATION_CHANNEL_INFO}
            error={
              (!!panel.ticket_notification_channel &&
                !existingChannelIds.has(panel.ticket_notification_channel)) ||
              (panel.use_threads && !panel.ticket_notification_channel)
            }
            disabled={!panel.use_threads}
            options={
              selectedGuild?.channels
                ?.filter((c) => c.type === 0)
                .map((channel) => ({
                  label: `# ${channel.name}`,
                  key: channel.id,
                })) || []
            }
            value={panel.ticket_notification_channel ?? null}
            onChange={(e) =>
              setPanel((prev) =>
                prev ? { ...prev, ticket_notification_channel: e ?? undefined } : prev,
              )
            }
          />
        </div>
        <div className="p-4 grid gap-4 grid-cols-1 md:grid-cols-2">
          <Select
            label="Naming Scheme"
            options={[
              { label: "ticket-%id%", key: "ticket-%id%" },
              { label: "ticket-%username%", key: "ticket-%username%" },
              { label: "ticket-%id%-%username%", key: "ticket-%id%-%username%" },
              { label: "ticket-%nickname%", key: "ticket-%nickname%" },
              { label: "ticket-%id_padded%", key: "ticket-%id_padded%" },
              { label: "Custom", key: "custom" },
            ]}
            value={
              PRESET_NAMING_SCHEMES.includes(panel.naming_scheme ?? "")
                ? (panel.naming_scheme ?? null)
                : "custom"
            }
            onChange={(e) =>
              setPanel((prev) =>
                prev
                  ? {
                      ...prev,
                      naming_scheme:
                        e === "custom"
                          ? !prev.naming_scheme ||
                            PRESET_NAMING_SCHEMES.includes(prev.naming_scheme)
                            ? ""
                            : prev.naming_scheme
                          : (e ?? prev.naming_scheme),
                    }
                  : prev,
              )
            }
            hideSearch
          />
          {!PRESET_NAMING_SCHEMES.includes(panel.naming_scheme ?? "") && (
            <TextInput
              label="Custom Naming Scheme"
              placeholder="ticket-%id%"
              value={panel.naming_scheme || ""}
              onChange={(e) => {
                const sanitised = e.replace(/ /g, "-").slice(0, 100);
                setPanel((prev) => (prev ? { ...prev, naming_scheme: sanitised } : prev));
              }}
            />
          )}
        </div>
        <div className="p-4 grid gap-4 grid-cols-1 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          <Slider
            label="Show in /open Command"
            value={panel.show_in_open_command}
            onChange={(e) =>
              setPanel((prev) => (prev ? { ...prev, show_in_open_command: e } : prev))
            }
          />
          <Slider
            label="Enable Overflow Category"
            value={panel.overflow_enabled}
            onChange={(e) => setPanel((prev) => (prev ? { ...prev, overflow_enabled: e } : prev))}
          />
          {panel.overflow_enabled && (
            <Select
              label="Overflow Category"
              placeholder="Select a category..."
              options={
                selectedGuild?.channels
                  ?.filter((c) => c.type === 4)
                  .map((c) => ({ label: c.name, key: c.id })) || []
              }
              value={panel.overflow_category_id || ""}
              onChange={(e) =>
                setPanel((prev) =>
                  prev ? { ...prev, overflow_category_id: e || undefined } : prev,
                )
              }
            />
          )}
        </div>
        <div className="p-4 grid gap-4 grid-cols-1 md:grid-cols-2">
          <div>
            <NumberInput
              label="Ticket Open Cooldown (seconds)"
              value={panel.cooldown_seconds ?? 0}
              min={0}
              onChange={(e) => setPanel((prev) => (prev ? { ...prev, cooldown_seconds: e } : prev))}
            />
            <Button
              variant="danger"
              type="button"
              className="mt-2 w-full justify-center text-sm font-medium"
              visuallyDisabled={isLocked}
              aria-describedby={isLocked ? "panel-lock-banner" : undefined}
              onClick={async () => {
                try {
                  await apiClient.panels.deleteCooldowns(guildId, panelId);
                  toast.success("Cooldowns reset successfully");
                } catch (error) {
                  console.error("Failed to reset cooldowns:", error);
                }
              }}
            >
              <FontAwesomeIcon icon={faTrash} className="mr-2" /> Reset Cooldowns
            </Button>
          </div>
          <NumberInput
            label="Max Open Tickets Per User"
            value={panel.ticket_limit ?? 0}
            min={0}
            max={10}
            onChange={(e) => setPanel((prev) => (prev ? { ...prev, ticket_limit: e } : prev))}
          />
        </div>
      </Collapsible>
      <Collapsible
        title="Closing & Claiming"
        subtitle="Control how tickets are closed and claimed by support"
        defaultOpen={false}
      >
        <div className="p-4">
          <h3 className="text-lg font-medium text-white mb-3">Closing</h3>
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
            <Slider
              label="Allow Users to Close Tickets"
              value={panel.users_can_close}
              onChange={(e) => setPanel((prev) => (prev ? { ...prev, users_can_close: e } : prev))}
            />
            <Slider
              label="Ticket Close Confirmation"
              value={panel.close_confirmation}
              onChange={(e) =>
                setPanel((prev) => (prev ? { ...prev, close_confirmation: e } : prev))
              }
            />
            <Slider
              label="Enable User Feedback"
              value={panel.feedback_enabled}
              onChange={(e) => setPanel((prev) => (prev ? { ...prev, feedback_enabled: e } : prev))}
            />
          </div>
          <div className="mt-4 grid gap-4 grid-cols-1 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
            <Slider
              label="Hide Close Button"
              value={panel.hide_close_button}
              onChange={(e) =>
                setPanel((prev) => (prev ? { ...prev, hide_close_button: e } : prev))
              }
            />
            <Slider
              label="Hide Close with Reason Button"
              value={panel.hide_close_with_reason_button}
              onChange={(e) =>
                setPanel((prev) => (prev ? { ...prev, hide_close_with_reason_button: e } : prev))
              }
            />
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-sm text-white">Exit Survey</span>
                {!premiumState?.premium && (
                  <span title="Collect user feedback after tickets close. Requires Premium.">
                    <FontAwesomeIcon
                      icon={faCrown}
                      className="text-amber-400 text-xs cursor-help"
                    />
                  </span>
                )}
              </div>
              <Select
                disabled={!premiumState?.premium}
                showNoneOption={true}
                options={
                  forms.map((form) => ({
                    label: form.title,
                    key: form.form_id.toString(),
                  })) || []
                }
                value={panel.exit_survey_form_id?.toString() ?? null}
                onChange={(e) =>
                  setPanel((prev) =>
                    prev ? { ...prev, exit_survey_form_id: e ? Number(e) : null } : prev,
                  )
                }
              />
            </div>
          </div>

          <div className="border-t border-gray-700 my-6"></div>

          <h3 className="text-lg font-medium text-white mb-3">Claiming</h3>
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
            <Slider
              label="Hide Claim Button"
              value={panel.hide_claim_button}
              onChange={(e) =>
                setPanel((prev) => (prev ? { ...prev, hide_claim_button: e } : prev))
              }
            />
            <Slider
              label="Support Can View Claimed Tickets"
              value={panel.support_can_view}
              onChange={(e) => setPanel((prev) => (prev ? { ...prev, support_can_view: e } : prev))}
            />
            <Slider
              label="Support Can Type in Claimed Tickets"
              value={panel.support_can_type}
              disabled={!panel.support_can_view}
              onChange={(e) => setPanel((prev) => (prev ? { ...prev, support_can_type: e } : prev))}
            />
          </div>
        </div>
      </Collapsible>
      <Collapsible
        title="Permissions"
        subtitle="Control what users can do inside tickets"
        defaultOpen={false}
      >
        <div className="p-4 grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          <Slider
            label="Add Reactions"
            value={panel.ticket_permissions?.add_reactions ?? false}
            onChange={(e) =>
              setPanel((prev) =>
                prev
                  ? {
                      ...prev,
                      ticket_permissions: { ...prev.ticket_permissions, add_reactions: e },
                    }
                  : prev,
              )
            }
          />
          <Slider
            label="Send Text-to-speech Messages"
            value={panel.ticket_permissions?.send_tts_messages ?? false}
            onChange={(e) =>
              setPanel((prev) =>
                prev
                  ? {
                      ...prev,
                      ticket_permissions: { ...prev.ticket_permissions, send_tts_messages: e },
                    }
                  : prev,
              )
            }
          />
          <Slider
            label="Embed Links"
            value={panel.ticket_permissions?.embed_links ?? false}
            onChange={(e) =>
              setPanel((prev) =>
                prev
                  ? { ...prev, ticket_permissions: { ...prev.ticket_permissions, embed_links: e } }
                  : prev,
              )
            }
          />
          <Slider
            label="Attach Files"
            value={panel.ticket_permissions?.attach_files ?? false}
            onChange={(e) =>
              setPanel((prev) =>
                prev
                  ? { ...prev, ticket_permissions: { ...prev.ticket_permissions, attach_files: e } }
                  : prev,
              )
            }
          />
          <Slider
            label="Use External Emojis"
            value={panel.ticket_permissions?.use_external_emojis ?? false}
            onChange={(e) =>
              setPanel((prev) =>
                prev
                  ? {
                      ...prev,
                      ticket_permissions: { ...prev.ticket_permissions, use_external_emojis: e },
                    }
                  : prev,
              )
            }
          />
          <Slider
            label="Use External Stickers"
            value={panel.ticket_permissions?.use_external_stickers ?? false}
            onChange={(e) =>
              setPanel((prev) =>
                prev
                  ? {
                      ...prev,
                      ticket_permissions: { ...prev.ticket_permissions, use_external_stickers: e },
                    }
                  : prev,
              )
            }
          />
          <Slider
            label="Send Voice Messages"
            value={panel.ticket_permissions?.send_voice_messages ?? false}
            onChange={(e) =>
              setPanel((prev) =>
                prev
                  ? {
                      ...prev,
                      ticket_permissions: { ...prev.ticket_permissions, send_voice_messages: e },
                    }
                  : prev,
              )
            }
          />
        </div>
      </Collapsible>
      <Collapsible
        title="Access Control"
        subtitle="Restrict who can open tickets via this panel"
        defaultOpen={false}
      >
        <div className="p-4">
          <AccessControlListEditor
            guildId={guildId}
            roles={selectedGuild?.roles || []}
            acl={panel.access_control_list || []}
            onChange={(acl) =>
              setPanel((prev) => (prev ? { ...prev, access_control_list: acl } : prev))
            }
          />
        </div>
      </Collapsible>
      <Collapsible
        title="Auto Close"
        subtitle="Automatically close tickets based on inactivity"
        defaultOpen={false}
      >
        <div className="p-6 grid gap-4 grid-cols-1 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          <Slider
            label="Enable Auto Close"
            value={panel.auto_close.enabled}
            onChange={(e) =>
              setPanel((prev) =>
                prev ? { ...prev, auto_close: { ...prev.auto_close, enabled: e } } : prev,
              )
            }
          />
          <Slider
            label="Close on User Leave"
            value={panel.auto_close.on_user_leave}
            disabled={!panel.auto_close.enabled}
            onChange={(e) =>
              setPanel((prev) =>
                prev ? { ...prev, auto_close: { ...prev.auto_close, on_user_leave: e } } : prev,
              )
            }
          />
        </div>
        <PremiumGate
          isPremium={!!premiumState?.premium}
          feature="auto-close"
          description="Auto-close inactive tickets after a set period."
          variant="overlay"
        >
          <div className="p-6 grid gap-4 grid-cols-1 sm:grid-cols-1 md:grid-cols-2">
            <DurationPicker
              label="Since Open with No Response"
              value={panel.auto_close.since_open_with_no_response}
              onChange={(e) =>
                setPanel((prev) =>
                  prev
                    ? {
                        ...prev,
                        auto_close: { ...prev.auto_close, since_open_with_no_response: e },
                      }
                    : prev,
                )
              }
              disabled={!panel.auto_close.enabled}
            />
            <DurationPicker
              label="Since Last Message"
              value={panel.auto_close.since_last_message}
              onChange={(e) =>
                setPanel((prev) =>
                  prev
                    ? { ...prev, auto_close: { ...prev.auto_close, since_last_message: e } }
                    : prev,
                )
              }
              disabled={!panel.auto_close.enabled}
            />
          </div>
        </PremiumGate>
      </Collapsible>

      <Collapsible
        title="Support Hours"
        subtitle="Limit when this panel accepts new tickets"
        defaultOpen={false}
      >
        <SupportHoursForm value={supportHours} onChange={handleSupportHoursChange} />
      </Collapsible>
      <Button
        variant="success"
        className="mt-4 text-sm font-medium"
        visuallyDisabled={isLocked}
        aria-describedby={isLocked ? "panel-lock-banner" : undefined}
        onClick={async () => {
          try {
            await apiClient.panels.update(
              guildId,
              panelId,
              preparePanelForApi(panel),
              SKIP_ERROR_TOAST,
            );

            // Save or delete support hours
            try {
              if (supportHours) {
                await apiClient.panels.setSupportHours(guildId, panelId, supportHours);
              } else if (initialSupportHours) {
                await apiClient.panels.deleteSupportHours(guildId, panelId);
              }
            } catch (err) {
              console.error("Failed to save support hours:", err);
              toast.warning("Panel saved but failed to update support hours.");
            }

            // Otherwise reopening the panel replays the cached pre-save response.
            await Promise.all([
              queryClient.invalidateQueries({ queryKey: guildKeys.panel(guildId, panelId) }),
              queryClient.invalidateQueries({ queryKey: guildKeys.panels(guildId) }),
            ]);

            toast.success("Panel Edited");
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
              toast.error(apiError ?? "Failed to save panel. Please try again.");
            }
            console.error("Failed to edit panel:", error);
          }
        }}
      >
        <FontAwesomeIcon icon={faSave} className="mr-2" /> Save Changes
      </Button>
      <TicketModeInfoModal
        isOpen={ticketModeInfoOpen}
        onClose={() => setTicketModeInfoOpen(false)}
      />
    </MainLayout>
  );
};

export default EditPanelsPage;
