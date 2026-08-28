import { useState, useEffect, useCallback, useId, useMemo, type FC } from "react";
import { apiClient } from "@/lib/api";
import { toast } from "sonner";
import type { GallerySubmission } from "@/types";
import Button from "@/components/Button";
import CardGridSkeleton from "@/components/skeletons/CardGridSkeleton";
import ConfirmModal from "@/components/modals/ConfirmModal";
import ActionModal from "@/components/modal-primitives/ActionModal";
import GalleryPreviewModal from "@/components/modals/GalleryPreviewModal";
import Select from "@/components/Select";
import Slider from "@/components/Slider";
import Tabs from "@/components/Tabs";
import { GALLERY_TYPE_BADGES } from "@/components/gallery/GalleryListingPreview";
import Textarea from "@/components/Textarea";
import SearchInput from "@/components/SearchInput";
import { useUrlSearch } from "@/hooks/useUrlSearch";
import { matchesSearch } from "@/lib/search";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faXmark, faTrash, faEye } from "@fortawesome/free-solid-svg-icons";
import { useAuthStore } from "@/stores/auth";
import { isAtLeast } from "@/lib/admin-tier";

type TabStatus = "pending" | "approved" | "rejected";

const STATUS_BADGE: Record<TabStatus, string> = {
  pending: "bg-yellow-600/20 text-yellow-400",
  approved: "bg-green-600/20 text-green-400",
  rejected: "bg-red-600/20 text-red-400",
};

const TYPE_OPTIONS = [
  { key: "panel", label: "Panels" },
  { key: "tag", label: "Tags" },
  { key: "form", label: "Forms" },
];

const AdminGalleryPage: FC = () => {
  const { user } = useAuthStore();
  const canModerate = isAtLeast(user?.admin_tier ?? "", "admin");
  const rejectHeadingId = useId();
  const [tab, setTab] = useState<TabStatus>("pending");
  const [listingType, setListingType] = useState<string>("all");
  const [submissions, setSubmissions] = useState<GallerySubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const { searchQuery, setSearchQuery, debouncedSearch } = useUrlSearch();

  // Reject modal
  const [rejectTarget, setRejectTarget] = useState<GallerySubmission | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejecting, setRejecting] = useState(false);

  // Remove modal
  const [removeTarget, setRemoveTarget] = useState<GallerySubmission | null>(null);

  // Preview modal
  const [previewTarget, setPreviewTarget] = useState<GallerySubmission | null>(null);

  const fetchSubmissions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.admin.gallery.list({
        status: tab,
        type: listingType === "all" ? undefined : listingType,
      });
      setSubmissions(res.data ?? []);
    } catch {
      // Error handled by interceptor
    } finally {
      setLoading(false);
    }
  }, [tab, listingType]);

  useEffect(() => {
    fetchSubmissions();
  }, [fetchSubmissions]);

  const filteredSubmissions = useMemo(() => {
    return submissions.filter((submission) =>
      matchesSearch(
        debouncedSearch,
        submission.name,
        submission.description,
        submission.category,
        submission.listing_type,
        submission.tags?.join(" "),
      ),
    );
  }, [submissions, debouncedSearch]);

  const handleApprove = async (submission: GallerySubmission) => {
    try {
      await apiClient.admin.gallery.approve(submission.id);
      toast.success(`"${submission.name}" approved.`);
      setSubmissions((prev) => prev.filter((s) => s.id !== submission.id));
    } catch {
      // Error handled by interceptor
    }
  };

  const handleReject = async () => {
    if (!rejectTarget) return;
    setRejecting(true);
    try {
      await apiClient.admin.gallery.reject(rejectTarget.id, rejectReason.trim());
      toast.success(`"${rejectTarget.name}" rejected.`);
      setSubmissions((prev) => prev.filter((s) => s.id !== rejectTarget.id));
      setRejectTarget(null);
      setRejectReason("");
    } catch {
      // Error handled by interceptor
    } finally {
      setRejecting(false);
    }
  };

  const handleRemove = async () => {
    if (!removeTarget) return;
    try {
      await apiClient.admin.gallery.remove(removeTarget.id);
      toast.success(`"${removeTarget.name}" removed from gallery.`);
      setSubmissions((prev) => prev.filter((s) => s.id !== removeTarget.id));
      setRemoveTarget(null);
    } catch {
      // Error handled by interceptor
    }
  };

  const handleToggleFeatured = async (submission: GallerySubmission) => {
    try {
      await apiClient.admin.gallery.update(submission.id, { featured: !submission.featured });
      setSubmissions((prev) =>
        prev.map((s) => (s.id === submission.id ? { ...s, featured: !s.featured } : s)),
      );
      toast.success(
        submission.featured ? `"${submission.name}" unfeatured.` : `"${submission.name}" featured.`,
      );
    } catch {
      // Error handled by interceptor
    }
  };

  return (
    <div>
      <header className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-semibold mb-2 text-center">Gallery Review</h1>
        <p className="text-center text-gray-400 text-sm sm:text-base">
          Review and manage gallery submissions
        </p>
      </header>

      {/* Tab buttons */}
      <Tabs
        tabs={[
          { key: "pending", label: "Pending" },
          { key: "approved", label: "Approved" },
          { key: "rejected", label: "Rejected" },
        ]}
        activeTab={tab}
        onChange={(key) => setTab(key as TabStatus)}
        ariaLabel="Submission status"
        className="justify-center mb-4"
      />

      <div className="flex flex-col sm:flex-row items-stretch sm:items-end justify-center gap-3 mb-6">
        <SearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Search submissions..."
          label="Search by name, description, category, or tags"
          className="w-full sm:max-w-xs"
        />
        <Select
          label="Type"
          value={listingType}
          onChange={(v) => setListingType(v ?? "all")}
          options={[{ key: "all", label: "All types" }, ...TYPE_OPTIONS]}
          placeholder="All types"
          hideSearch
          className="w-full sm:w-48"
        />
      </div>

      <div role="tabpanel" id={`tabpanel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {loading ? (
          <CardGridSkeleton cards={6} />
        ) : filteredSubmissions.length === 0 ? (
          <p className="text-gray-400 text-center py-8">
            {debouncedSearch
              ? `No submissions match "${debouncedSearch}".`
              : `No ${tab} submissions found.`}
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredSubmissions.map((submission) => {
              const submissionType = submission.listing_type || "panel";
              const typeBadge = GALLERY_TYPE_BADGES[submissionType];
              const date = new Date(submission.created_at).toLocaleDateString("en-GB", {
                year: "numeric",
                month: "short",
                day: "numeric",
              });

              return (
                <article
                  key={submission.id}
                  className="bg-gray-800 rounded-xl overflow-hidden border border-gray-700"
                  aria-label={`${submission.name} - ${submission.status}`}
                >
                  <div className="p-4">
                    <h3 className="text-white font-medium truncate">{submission.name}</h3>
                    <div className="flex items-center gap-2 mt-1 text-xs text-gray-400 flex-wrap">
                      {typeBadge && (
                        <span
                          className={`${typeBadge.className} rounded-full px-2 py-0.5 font-medium`}
                        >
                          {typeBadge.label}
                        </span>
                      )}
                      <span className="bg-blue-600/20 text-blue-400 rounded-full px-2 py-0.5">
                        {submission.category}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 capitalize ${STATUS_BADGE[submission.status]}`}
                      >
                        {submission.status}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 mt-1 flex items-center gap-1.5">
                      by
                      {submission.submitted_user.avatar_url && (
                        <img
                          src={submission.submitted_user.avatar_url}
                          alt=""
                          className="w-4 h-4 rounded-full inline"
                        />
                      )}
                      {submission.submitted_user.username} &middot; {date}
                    </div>
                  </div>

                  <div className="border-t border-gray-700 px-4 py-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setPreviewTarget(submission)}
                      title={`Preview ${submission.name}`}
                      className="w-full"
                    >
                      <FontAwesomeIcon icon={faEye} className="mr-1" aria-hidden="true" />
                      Preview
                    </Button>
                  </div>

                  {/* Status-specific actions */}
                  {canModerate && submission.status === "pending" && (
                    <div className="flex gap-2 border-t border-gray-700 px-4 py-3">
                      <Button
                        variant="success"
                        size="sm"
                        onClick={() => handleApprove(submission)}
                        title={`Approve ${submission.name}`}
                        className="flex-1"
                      >
                        <FontAwesomeIcon icon={faCheck} className="mr-1" aria-hidden="true" />
                        Approve
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => setRejectTarget(submission)}
                        title={`Reject ${submission.name}`}
                        className="flex-1"
                      >
                        <FontAwesomeIcon icon={faXmark} className="mr-1" aria-hidden="true" />
                        Reject
                      </Button>
                    </div>
                  )}

                  {canModerate && submission.status === "approved" && (
                    <div className="flex items-center justify-between border-t border-gray-700 px-4 py-3">
                      <Slider
                        label="Featured"
                        labelPosition="left"
                        value={submission.featured}
                        onChange={() => handleToggleFeatured(submission)}
                      />
                      <Button
                        variant="danger"
                        size="md"
                        onClick={() => setRemoveTarget(submission)}
                        title={`Remove ${submission.name}`}
                      >
                        <FontAwesomeIcon icon={faTrash} className="mr-1" aria-hidden="true" />
                        Remove
                      </Button>
                    </div>
                  )}

                  {submission.status === "rejected" && submission.review_note && (
                    <div className="border-t border-gray-700 px-4 py-3">
                      <div className="bg-red-600/10 border border-red-600/20 rounded p-2 text-sm text-red-300">
                        <span className="font-medium">Reason:</span> {submission.review_note}
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>

      <GalleryPreviewModal
        listing={previewTarget}
        open={!!previewTarget}
        onClose={() => setPreviewTarget(null)}
      />

      {/* Reject modal */}
      {canModerate && (
        <ActionModal
          isOpen={!!rejectTarget}
          onClose={() => setRejectTarget(null)}
          ariaLabelledBy={rejectHeadingId}
        >
          <div className="p-6">
            <h3 id={rejectHeadingId} className="text-xl font-semibold mb-4">
              Reject Submission
            </h3>
            <p className="text-gray-300 mb-4">
              Rejecting &ldquo;{rejectTarget?.name}&rdquo;. Please provide a reason.
            </p>
            <Textarea
              label="Reason for rejection"
              placeholder="Reason for rejection..."
              value={rejectReason}
              onChange={(value) => setRejectReason(value)}
              max={500}
            />
            <div className="flex justify-end gap-3 mt-4">
              <Button
                variant="secondary"
                onClick={() => {
                  setRejectTarget(null);
                  setRejectReason("");
                }}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={handleReject}
                disabled={!rejectReason.trim()}
                isLoading={rejecting}
              >
                {rejecting ? "Rejecting..." : "Reject"}
              </Button>
            </div>
          </div>
        </ActionModal>
      )}

      {/* Remove confirm modal */}
      {canModerate && (
        <ConfirmModal
          isOpen={!!removeTarget}
          title="Remove from Gallery"
          message={`Are you sure you want to remove "${removeTarget?.name ?? ""}" from the gallery? This action cannot be undone.`}
          confirmText="Remove"
          confirmVariant="danger"
          onConfirm={handleRemove}
          onCancel={() => setRemoveTarget(null)}
        />
      )}
    </div>
  );
};

export default AdminGalleryPage;
