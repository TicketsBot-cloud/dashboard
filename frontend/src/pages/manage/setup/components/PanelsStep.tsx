import { useState, useEffect, useMemo, type FC } from "react";
import { apiClient } from "@/lib/api";
import { toast } from "sonner";
import TextInput from "@/components/TextInput";
import Textarea from "@/components/Textarea";
import Select from "@/components/Select";
import ColourSelect from "@/components/ColourSelect";
import Button from "@/components/Button";
import GalleryCard from "@/components/GalleryCard";
import CardGridSkeleton from "@/components/skeletons/CardGridSkeleton";
import Tabs from "@/components/Tabs";
import type { GalleryListing } from "@/types";

interface PanelsStepProps {
  guildId: string;
  channels: Array<{ id: string; type: number; name: string }>;
  createdTeams: Array<{ id: number; name: string }>;
  createdForms: Array<{ form_id: number; title: string }>;
  onPanelCreated: () => void;
}

type TabId = "import" | "scratch";

/** Blurple (#5865F2) as a decimal integer. */
const DEFAULT_COLOUR = 5793266;

/**
 * Converts a decimal colour integer to a CSS hex string (e.g. 5793266 -> "#5865F2").
 */
function colourToHex(colour: number): string {
  return "#" + colour.toString(16).padStart(6, "0");
}

/**
 * Converts a CSS hex string to a decimal integer (e.g. "#5865F2" -> 5793266).
 */
function hexToColour(hex: string): number {
  return parseInt(hex.replace("#", ""), 16) || DEFAULT_COLOUR;
}

const PanelsStep: FC<PanelsStepProps> = ({
  guildId,
  channels,
  createdTeams,
  createdForms,
  onPanelCreated,
}) => {
  const [activeTab, setActiveTab] = useState<TabId>("import");

  // ─── Import tab state ────────────────────────────────────────────────────────
  const [featuredListings, setFeaturedListings] = useState<GalleryListing[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedListing, setSelectedListing] = useState<GalleryListing | null>(null);
  const [importChannel, setImportChannel] = useState<string | null>(null);
  const [importCategory, setImportCategory] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  // ─── Create-from-scratch state ───────────────────────────────────────────────
  const [title, setTitle] = useState("Open a Ticket");
  const [content, setContent] = useState("Click the button below to open a support ticket.");
  const [colour, setColour] = useState(colourToHex(DEFAULT_COLOUR));
  const [channel, setChannel] = useState<string | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [teamId, setTeamId] = useState<string | null>("default");
  const [formId, setFormId] = useState<string | null>(null);
  const [isCreatingPanel, setIsCreatingPanel] = useState(false);

  // ─── Derived option lists ────────────────────────────────────────────────────
  const textChannelOptions = useMemo(
    () => channels.filter((c) => c.type === 0).map((c) => ({ key: c.id, label: "#" + c.name })),
    [channels],
  );

  const categoryOptions = useMemo(
    () => channels.filter((c) => c.type === 4).map((c) => ({ key: c.id, label: c.name })),
    [channels],
  );

  const teamOptions = useMemo(
    () => [
      { key: "default", label: "Default" },
      ...createdTeams.map((t) => ({ key: t.id.toString(), label: t.name })),
    ],
    [createdTeams],
  );

  const formOptions = useMemo(
    () =>
      createdForms.map((f) => ({
        key: f.form_id.toString(),
        label: f.title,
      })),
    [createdForms],
  );

  // ─── Fetch featured listings on mount ────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    const fetchListings = async () => {
      setIsLoading(true);
      try {
        const res = await apiClient.onboarding.getFeaturedListings(guildId);
        if (!cancelled) {
          setFeaturedListings(res.data);
        }
      } catch {
        if (!cancelled) {
          toast.error("Failed to load featured templates");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    fetchListings();
    return () => {
      cancelled = true;
    };
  }, [guildId]);

  // ─── Import handlers ─────────────────────────────────────────────────────────
  const handleSelectListing = (listing: GalleryListing) => {
    setSelectedListing(listing);
    setImportChannel(null);
    setImportCategory(null);
  };

  const handleImport = async () => {
    if (!selectedListing || !importChannel || !importCategory) return;

    setIsImporting(true);
    try {
      await apiClient.gallery.import(guildId, selectedListing.id, {
        channel_id: importChannel,
        category_id: importCategory,
      });
      toast.success("Panel imported");
      onPanelCreated();
    } catch {
      // Error toast is handled by the global interceptor
    } finally {
      setIsImporting(false);
    }
  };

  // ─── Create-from-scratch handler ─────────────────────────────────────────────
  const handleCreate = async () => {
    if (!title.trim() || !channel || !category) return;

    setIsCreatingPanel(true);
    try {
      await apiClient.panels.create(guildId, {
        title: title.trim(),
        content,
        colour: hexToColour(colour),
        channel_id: channel,
        category_id: category,
        default_team: teamId === "default",
        teams: teamId !== "default" && teamId ? [parseInt(teamId)] : [],
        form_id: formId ? parseInt(formId) : null,
        button_style: "1",
        button_label: "Open a Ticket",
      } as Record<string, unknown>);
      toast.success("Panel created");
      onPanelCreated();
    } catch {
      // Error toast is handled by the global interceptor
    } finally {
      setIsCreatingPanel(false);
    }
  };

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <div>
      <Tabs
        tabs={[
          { key: "import", label: "Import a template" },
          { key: "scratch", label: "Create from scratch" },
        ]}
        activeTab={activeTab}
        onChange={(tab) => setActiveTab(tab as TabId)}
        ariaLabel="Panel creation method"
        className="mb-6"
      />

      {/* Tab content */}
      {activeTab === "import" ? (
        /* ── Import tab ──────────────────────────────────────────────────── */
        isLoading ? (
          <CardGridSkeleton cards={6} />
        ) : featuredListings.length === 0 ? (
          <p className="text-gray-400 text-center py-8">
            No featured templates available. Try creating from scratch.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
              {featuredListings.map((listing) => (
                <GalleryCard
                  key={listing.id}
                  listing={listing}
                  onSelect={handleSelectListing}
                  selected={selectedListing?.id === listing.id}
                  onImport={handleSelectListing}
                  actionLabel="Select"
                />
              ))}
            </div>

            {/* Import configuration (shown when a listing is selected) */}
            {selectedListing && (
              <div className="rounded-lg bg-gray-800 p-4 space-y-4">
                <h3 className="text-sm font-medium text-white">
                  Configure import for &ldquo;{selectedListing.name}&rdquo;
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Select
                    label="Channel"
                    value={importChannel}
                    options={textChannelOptions}
                    onChange={setImportChannel}
                    placeholder="Select a channel..."
                  />
                  <Select
                    label="Category"
                    value={importCategory}
                    options={categoryOptions}
                    onChange={setImportCategory}
                    placeholder="Select a category..."
                  />
                </div>
                <Button
                  variant="primary"
                  onClick={handleImport}
                  disabled={!importChannel || !importCategory || isImporting}
                >
                  {isImporting ? "Importing..." : "Import Panel"}
                </Button>
              </div>
            )}
          </>
        )
      ) : (
        /* ── Create from scratch tab ─────────────────────────────────────── */
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <TextInput
              label="Title"
              value={title}
              onChange={setTitle}
              placeholder="Open a Ticket"
              maxLength={80}
            />
            <ColourSelect label="Colour" value={colour} onChange={setColour} />
          </div>
          <Textarea
            label="Content"
            value={content}
            onChange={setContent}
            placeholder="Click the button below to open a support ticket."
            max={1024}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="Channel"
              value={channel}
              options={textChannelOptions}
              onChange={setChannel}
              placeholder="Select a channel..."
            />
            <Select
              label="Category"
              value={category}
              options={categoryOptions}
              onChange={setCategory}
              placeholder="Select a category..."
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="Team"
              value={teamId}
              options={teamOptions}
              onChange={setTeamId}
              placeholder="Select a team..."
            />
            <Select
              label="Form"
              value={formId}
              options={formOptions}
              onChange={setFormId}
              placeholder="Select a form..."
              showNoneOption
              noneOptionLabel="None"
            />
          </div>
          <Button
            variant="primary"
            onClick={handleCreate}
            disabled={!title.trim() || !channel || !category || isCreatingPanel}
          >
            {isCreatingPanel ? "Creating..." : "Create Panel"}
          </Button>
        </div>
      )}
    </div>
  );
};

export default PanelsStep;
