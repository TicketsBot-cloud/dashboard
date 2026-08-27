import { useState, useEffect, useId, type FC } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import ActionModal from "@/components/modal-primitives/ActionModal";
import Button from "@/components/Button";
import Select from "@/components/Select";
import { apiClient } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";
import type { GalleryListing, GuildChannel } from "@/types";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faDownload, faSpinner } from "@fortawesome/free-solid-svg-icons";

interface GalleryImportModalProps {
  listing: GalleryListing;
  open: boolean;
  onClose: () => void;
}

const GalleryImportModal: FC<GalleryImportModalProps> = ({ listing, open, onClose }) => {
  const navigate = useNavigate();
  const headingId = useId();
  const guilds = useAuthStore((s) => s.guilds);
  const manageableGuilds = guilds.filter((g) => g.permission_level >= 2);

  const [selectedGuildId, setSelectedGuildId] = useState<string | null>(null);
  const [channels, setChannels] = useState<GuildChannel[]>([]);
  const [loadingChannels, setLoadingChannels] = useState(false);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (!selectedGuildId) {
      setChannels([]);
      setSelectedChannelId(null);
      setSelectedCategoryId(null);
      return;
    }

    setLoadingChannels(true);
    apiClient.guilds
      .getChannels(selectedGuildId)
      .then((res) => setChannels(res.data))
      .catch(() => {
        // Error handled by interceptor
      })
      .finally(() => setLoadingChannels(false));
  }, [selectedGuildId]);

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      setSelectedGuildId(null);
      setChannels([]);
      setSelectedChannelId(null);
      setSelectedCategoryId(null);
      setImporting(false);
    }
  }, [open]);

  const textChannels = channels.filter((c) => c.type === 0);
  const categoryChannels = channels.filter((c) => c.type === 4);

  const handleImport = async () => {
    if (!selectedGuildId) return;

    setImporting(true);
    try {
      const res = await apiClient.gallery.import(selectedGuildId, listing.id, {
        channel_id: selectedChannelId ?? undefined,
        category_id: selectedCategoryId ?? undefined,
      });
      toast.success("Panel imported successfully.");
      onClose();
      navigate(`/manage/${selectedGuildId}/panels/edit/${res.data.panel_id}`);
    } catch {
      // Error handled by interceptor
    } finally {
      setImporting(false);
    }
  };

  return (
    <ActionModal isOpen={open} onClose={onClose} className="max-w-lg" ariaLabelledBy={headingId}>
      <div className="p-6">
        <h3 id={headingId} className="text-xl font-semibold mb-1">
          Import Panel
        </h3>
        <p className="text-gray-400 text-sm mb-6">
          Import &ldquo;{listing.name}&rdquo; into one of your servers.
        </p>

        <div className="space-y-4">
          <Select
            label="Server"
            placeholder="Select a server..."
            value={selectedGuildId}
            onChange={(v) => setSelectedGuildId(v)}
            options={manageableGuilds.map((g) => ({ key: g.id, label: g.name }))}
          />

          {selectedGuildId && (
            <>
              {loadingChannels ? (
                <div className="text-gray-400 text-sm flex items-center gap-2">
                  <FontAwesomeIcon icon={faSpinner} spin aria-hidden="true" />
                  Loading channels...
                </div>
              ) : (
                <>
                  <Select
                    label="Panel Channel"
                    placeholder="Select a channel..."
                    value={selectedChannelId}
                    onChange={(v) => setSelectedChannelId(v)}
                    options={textChannels.map((c) => ({ key: c.id, label: `#${c.name}` }))}
                  />
                  <Select
                    label="Ticket Category"
                    placeholder="Select a category..."
                    value={selectedCategoryId}
                    onChange={(v) => setSelectedCategoryId(v)}
                    options={categoryChannels.map((c) => ({ key: c.id, label: c.name }))}
                  />
                </>
              )}
            </>
          )}
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleImport}
            disabled={!selectedGuildId || !selectedChannelId || !selectedCategoryId}
            isLoading={importing}
            className="font-medium"
          >
            {importing ? (
              "Importing..."
            ) : (
              <>
                <FontAwesomeIcon icon={faDownload} aria-hidden="true" />
                Import Panel
              </>
            )}
          </Button>
        </div>
      </div>
    </ActionModal>
  );
};

export default GalleryImportModal;
