import { useState, useEffect, useId, type FC } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import ActionModal from "@/components/modal-primitives/ActionModal";
import Button from "@/components/Button";
import Select from "@/components/Select";
import TextInput from "@/components/TextInput";
import { apiClient } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";
import type { GalleryListing } from "@/types";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faDownload } from "@fortawesome/free-solid-svg-icons";

interface GalleryImportTagModalProps {
  listing: GalleryListing;
  open: boolean;
  onClose: () => void;
}

const GalleryImportTagModal: FC<GalleryImportTagModalProps> = ({ listing, open, onClose }) => {
  const navigate = useNavigate();
  const headingId = useId();
  const guilds = useAuthStore((s) => s.guilds);
  const manageableGuilds = guilds.filter((g) => g.permission_level >= 2);

  const [selectedGuildId, setSelectedGuildId] = useState<string | null>(null);
  const [tagId, setTagId] = useState("");
  const [importing, setImporting] = useState(false);

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      setSelectedGuildId(null);
      setTagId("");
      setImporting(false);
    }
  }, [open]);

  const handleImport = async () => {
    if (!selectedGuildId) return;
    if (!/^[a-zA-Z0-9\-_]{1,16}$/.test(tagId.trim())) {
      toast.error(
        "Tag ID must be 1–16 characters and only contain letters, numbers, hyphens, and underscores.",
      );
      return;
    }

    setImporting(true);
    try {
      await apiClient.gallery.importTag(selectedGuildId, listing.id, {
        tag_id: tagId.trim(),
      });
      toast.success("Tag imported successfully.");
      onClose();
      navigate(`/manage/${selectedGuildId}/tags`);
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
          Import Tag
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
            <TextInput
              label="Tag ID"
              placeholder="e.g. welcome"
              value={tagId}
              onChange={setTagId}
              maxLength={16}
            />
          )}
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleImport}
            disabled={!selectedGuildId || !tagId.trim()}
            isLoading={importing}
            className="font-medium"
          >
            {importing ? (
              "Importing..."
            ) : (
              <>
                <FontAwesomeIcon icon={faDownload} aria-hidden="true" />
                Import Tag
              </>
            )}
          </Button>
        </div>
      </div>
    </ActionModal>
  );
};

export default GalleryImportTagModal;
