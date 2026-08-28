import { useEffect, useId, useState, type FC, type ReactNode } from "react";
import DismissibleModal from "@/components/modal-primitives/DismissibleModal";
import Tabs from "@/components/Tabs";
import GalleryListingPreview, {
  GALLERY_TYPE_BADGES,
  listingHasMarkdown,
} from "@/components/gallery/GalleryListingPreview";
import type { GallerySubmission } from "@/types";

type PreviewView = "rendered" | "raw";

const PREVIEW_TABS = [
  { key: "rendered", label: "Rendered" },
  { key: "raw", label: "Raw" },
];

const PreviewBody: FC<{
  listing: GallerySubmission;
  view: PreviewView;
  onViewChange: (view: PreviewView) => void;
}> = ({ listing, view, onViewChange }) => {
  if (!listingHasMarkdown(listing)) {
    return (
      <div className="space-y-6">
        <GalleryListingPreview listing={listing} />
      </div>
    );
  }

  return (
    <>
      <Tabs
        tabs={PREVIEW_TABS}
        activeTab={view}
        onChange={(key) => onViewChange(key as PreviewView)}
        ariaLabel="Preview format"
        className="mb-4"
      />
      <div
        role="tabpanel"
        id={`tabpanel-${view}`}
        aria-labelledby={`tab-${view}`}
        className="space-y-6"
      >
        <GalleryListingPreview listing={listing} raw={view === "raw"} />
      </div>
    </>
  );
};

const MetaRow: FC<{ label: string; children: ReactNode }> = ({ label, children }) => (
  <div className="flex gap-2">
    <dt className="text-gray-500 shrink-0">{label}</dt>
    <dd className="text-gray-300 min-w-0 wrap-break-word">{children}</dd>
  </div>
);

interface GalleryPreviewModalProps {
  listing: GallerySubmission | null;
  open: boolean;
  onClose: () => void;
}

const GalleryPreviewModal: FC<GalleryPreviewModalProps> = ({ listing, open, onClose }) => {
  const headingId = useId();
  const [view, setView] = useState<PreviewView>("rendered");

  useEffect(() => {
    if (open) setView("rendered");
  }, [open, listing?.id]);

  const badge = listing ? GALLERY_TYPE_BADGES[listing.listing_type || "panel"] : undefined;
  const createdDate = listing
    ? new Date(listing.created_at).toLocaleDateString("en-GB", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "";

  return (
    <DismissibleModal
      isOpen={open}
      onClose={onClose}
      ariaLabelledBy={headingId}
      className="max-w-4xl max-h-[90vh] overflow-y-auto"
    >
      {listing && (
        <>
          <div className="flex items-center gap-2 flex-wrap mb-1 pr-6">
            <h3 id={headingId} className="text-xl font-semibold text-white">
              {listing.name}
            </h3>
            {badge && (
              <span className={`${badge.className} rounded-full px-2.5 py-0.5 text-xs font-medium`}>
                {badge.label}
              </span>
            )}
          </div>
          <p className="text-gray-400 text-sm mb-4">{listing.description}</p>

          <PreviewBody listing={listing} view={view} onViewChange={setView} />

          <dl className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <MetaRow label="Category">{listing.category}</MetaRow>
            <MetaRow label="Status">
              <span className="capitalize">{listing.status}</span>
            </MetaRow>
            <MetaRow label="Submitted by">
              <span className="inline-flex items-center gap-1.5">
                {listing.submitted_user.avatar_url && (
                  <img
                    src={listing.submitted_user.avatar_url}
                    alt=""
                    className="w-4 h-4 rounded-full"
                  />
                )}
                {listing.submitted_user.username}
              </span>
            </MetaRow>
            <MetaRow label="Submitted">{createdDate}</MetaRow>
            <MetaRow label="Source server">{listing.source_guild_id}</MetaRow>
            <MetaRow label="Imports">{listing.import_count}</MetaRow>
            {listing.tags?.length > 0 && (
              <MetaRow label="Tags">
                <span className="flex flex-wrap gap-1.5">
                  {listing.tags.map((tag) => (
                    <span
                      key={tag}
                      className="bg-gray-700 text-gray-300 rounded px-2 py-0.5 text-xs"
                    >
                      {tag}
                    </span>
                  ))}
                </span>
              </MetaRow>
            )}
          </dl>

          {listing.status === "rejected" && listing.review_note && (
            <div className="mt-4 bg-red-600/10 border border-red-600/20 rounded p-3 text-sm text-red-300">
              <span className="font-medium">Rejection reason:</span> {listing.review_note}
            </div>
          )}
        </>
      )}
    </DismissibleModal>
  );
};

export default GalleryPreviewModal;
