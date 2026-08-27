import { useState, useEffect, useId, type FC } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import ActionModal from "@/components/modal-primitives/ActionModal";
import Button from "@/components/Button";
import Select from "@/components/Select";
import TextInput from "@/components/TextInput";
import { apiClient } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";
import type { GalleryListing, GalleryFormSnapshot } from "@/types";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faDownload } from "@fortawesome/free-solid-svg-icons";

interface GalleryImportFormModalProps {
  listing: GalleryListing;
  open: boolean;
  onClose: () => void;
}

const GalleryImportFormModal: FC<GalleryImportFormModalProps> = ({ listing, open, onClose }) => {
  const navigate = useNavigate();
  const headingId = useId();
  const guilds = useAuthStore((s) => s.guilds);
  const manageableGuilds = guilds.filter((g) => g.permission_level >= 2);

  const [selectedGuildId, setSelectedGuildId] = useState<string | null>(null);
  const [titleOverride, setTitleOverride] = useState("");
  const [importing, setImporting] = useState(false);

  const snapshotTitle = (listing.snapshot_data as GalleryFormSnapshot | undefined)?.title;

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      setSelectedGuildId(null);
      setTitleOverride("");
      setImporting(false);
    }
  }, [open]);

  const handleImport = async () => {
    if (!selectedGuildId) return;

    setImporting(true);
    try {
      const res = await apiClient.gallery.importForm(selectedGuildId, listing.id, {
        title: titleOverride.trim() || undefined,
      });
      toast.success("Form imported successfully.");
      onClose();
      navigate(`/manage/${selectedGuildId}/forms/edit/${res.data.form_id}`);
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
          Import Form
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
              label="Title"
              placeholder={snapshotTitle || "Form title"}
              value={titleOverride}
              onChange={setTitleOverride}
              maxLength={45}
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
            disabled={!selectedGuildId}
            isLoading={importing}
            className="font-medium"
          >
            {importing ? (
              "Importing..."
            ) : (
              <>
                <FontAwesomeIcon icon={faDownload} aria-hidden="true" />
                Import Form
              </>
            )}
          </Button>
        </div>
      </div>
    </ActionModal>
  );
};

export default GalleryImportFormModal;
