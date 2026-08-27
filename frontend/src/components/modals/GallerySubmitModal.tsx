import { useState, useId, type FC } from "react";
import { toast } from "sonner";
import ActionModal from "@/components/modal-primitives/ActionModal";
import Button from "@/components/Button";
import TextInput from "@/components/TextInput";
import Select from "@/components/Select";
import { apiClient } from "@/lib/api";
import type { GallerySubmission } from "@/types";

interface GallerySubmitModalProps {
  itemType: "panel" | "tag" | "form";
  itemId: number | string;
  itemTitle: string;
  guildId: string;
  open: boolean;
  onClose: () => void;
  onSubmitted?: () => void;
  /** If provided, the modal operates in re-submit mode - editing an existing listing. */
  existingSubmission?: GallerySubmission;
}

const CATEGORY_OPTIONS = [
  { key: "support", label: "Support", description: "Customer support and help desks" },
  { key: "moderation", label: "Moderation", description: "Ban appeals, reports, rule violations" },
  { key: "sales", label: "Sales", description: "Orders, purchases, commercial enquiries" },
  {
    key: "application",
    label: "Applications",
    description: "Staff recruitment, team tryouts, sign-ups",
  },
  { key: "feedback", label: "Feedback", description: "Suggestions, bug reports, feature requests" },
  { key: "general", label: "General", description: "Other designs" },
  { key: "other", label: "Other", description: "Anything else" },
];

const TYPE_LABELS: Record<string, string> = {
  panel: "panel",
  tag: "tag",
  form: "form",
};

const GallerySubmitModal: FC<GallerySubmitModalProps> = ({
  itemType,
  itemId,
  itemTitle,
  guildId,
  open,
  onClose,
  onSubmitted,
  existingSubmission,
}) => {
  const isResubmit = !!existingSubmission;
  const headingId = useId();
  const [name, setName] = useState(existingSubmission?.name || itemTitle || "");
  const [description, setDescription] = useState(existingSubmission?.description || "");
  const [category, setCategory] = useState<string | null>(existingSubmission?.category || null);
  const [tags, setTags] = useState<string[]>(() => {
    const existing = existingSubmission?.tags || [];
    return [existing[0] || "", existing[1] || "", existing[2] || ""];
  });
  const [submitting, setSubmitting] = useState(false);

  const typeLabel = TYPE_LABELS[itemType] || "template";

  const handleTagChange = (index: number, value: string) => {
    setTags((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error("Please enter a name for your listing.");
      return;
    }
    if (!description.trim()) {
      toast.error("Please enter a description.");
      return;
    }
    if (!category) {
      toast.error("Please select a category.");
      return;
    }

    const filteredTags = tags.map((t) => t.trim()).filter(Boolean);

    setSubmitting(true);
    try {
      const body = {
        name: name.trim(),
        description: description.trim(),
        category,
        tags: filteredTags,
      };

      if (isResubmit) {
        let sourceQuery = "";
        if (itemType === "tag") sourceQuery = `?tagId=${itemId}`;
        else if (itemType === "form") sourceQuery = `?formId=${itemId}`;
        else if (itemId) sourceQuery = `?panelId=${itemId}`;
        await apiClient.gallery.resubmit(guildId, existingSubmission!.id, body, sourceQuery);
        toast.success("Template updated and re-submitted for review.");
      } else if (itemType === "tag") {
        await apiClient.gallery.submitTag(guildId, String(itemId), body);
        toast.success("Template submitted to the gallery for review.");
      } else if (itemType === "form") {
        await apiClient.gallery.submitForm(guildId, Number(itemId), body);
        toast.success("Template submitted to the gallery for review.");
      } else {
        await apiClient.gallery.submit(guildId, Number(itemId), body);
        toast.success("Template submitted to the gallery for review.");
      }
      onSubmitted?.();
      onClose();
    } catch {
      // Error handled by interceptor
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ActionModal isOpen={open} onClose={onClose} className="max-w-lg" ariaLabelledBy={headingId}>
      <div className="p-6">
        <h3 id={headingId} className="text-xl font-semibold mb-1">
          {isResubmit ? "Update Gallery Submission" : "Publish to Gallery"}
        </h3>
        <p className="text-gray-400 text-sm mb-4">
          {isResubmit
            ? `Update your listing with the latest design from "${itemTitle}". This will re-submit it for review.`
            : `Share your "${itemTitle}" ${typeLabel} design with the community.`}
        </p>

        <div className="bg-gray-700/50 rounded-lg p-3 mb-4 text-sm text-gray-300">
          <p className="mb-1 font-medium text-white">Submission guidelines</p>
          <p>
            Please ensure your {typeLabel} has a descriptive title, meaningful content, and no
            guild-specific references.
          </p>
        </div>

        <div className="space-y-4">
          <TextInput
            label="Name"
            placeholder="e.g. Customer Support Panel"
            value={name}
            onChange={setName}
            maxLength={100}
          />

          <div className="flex flex-col">
            <label htmlFor="gallery-submit-description" className="mb-1 text-white">
              Description
            </label>
            <textarea
              id="gallery-submit-description"
              className="bg-gray-700 border border-neutral-600 rounded p-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              rows={3}
              maxLength={500}
              placeholder="Describe what this template is for and how it works..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              aria-describedby="gallery-submit-description-count"
              aria-required="true"
            />
            <span
              id="gallery-submit-description-count"
              className="text-xs text-gray-400 mt-1 text-right"
              aria-live="polite"
            >
              {description.length}/500
            </span>
          </div>

          <Select
            label="Category"
            placeholder="Select a category..."
            value={category}
            onChange={setCategory}
            options={CATEGORY_OPTIONS.map((c) => ({
              key: c.key,
              label: `${c.label} - ${c.description}`,
            }))}
          />

          <fieldset>
            <legend className="mb-1 text-white block">Tags (up to 3)</legend>
            <div className="flex gap-2">
              {tags.map((tag, i) => (
                <TextInput
                  key={i}
                  label={`Tag ${i + 1}`}
                  placeholder={`Tag ${i + 1}`}
                  value={tag}
                  onChange={(v) => handleTagChange(i, v)}
                  maxLength={30}
                  className="flex-1 [&>label]:sr-only"
                />
              ))}
            </div>
          </fieldset>
        </div>

        <div className="bg-blue-600/10 border border-blue-600/30 rounded-lg p-3 mt-4 text-sm text-blue-300">
          Your submission will be reviewed by our team, typically within 48 hours.
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            isLoading={submitting}
            className="font-medium"
          >
            {submitting ? "Submitting..." : isResubmit ? "Update & Re-submit" : "Submit for Review"}
          </Button>
        </div>
      </div>
    </ActionModal>
  );
};

export default GallerySubmitModal;
