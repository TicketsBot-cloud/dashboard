import { useEffect, useId, useState, type FC, type ReactNode } from "react";
import { Link } from "react-router";
import { faServer } from "@fortawesome/free-solid-svg-icons";
import DismissibleModal from "@/components/modal-primitives/DismissibleModal";
import ImageWithFallback from "@/components/ImageWithFallback";
import Tabs from "@/components/Tabs";
import GalleryListingPreview, {
  GALLERY_TYPE_BADGES,
  listingHasMarkdown,
} from "@/components/gallery/GalleryListingPreview";
import { guildIconUrl, userAvatarUrl } from "@/lib/discord-cdn";
import { useDiscordEmoji } from "@/lib/discord-emoji";
import type { AdminGallerySubmission, GallerySubmittedUser } from "@/types";

const REVIEW_LABEL: Record<AdminGallerySubmission["status"], string> = {
  pending: "Resubmitted by",
  approved: "Approved by",
  rejected: "Rejected by",
};

type PreviewView = "rendered" | "raw";

const PREVIEW_TABS = [
  { key: "rendered", label: "Rendered" },
  { key: "raw", label: "Raw" },
];

const PreviewBody: FC<{
  listing: AdminGallerySubmission;
  view: PreviewView;
  onViewChange: (view: PreviewView) => void;
}> = ({ listing, view, onViewChange }) => {
  const emoji = useDiscordEmoji();

  if (!listingHasMarkdown(listing, emoji)) {
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

const IdText: FC<{ title: string; children: ReactNode }> = ({ title, children }) => (
  <span className="font-mono text-xs text-gray-400" title={title}>
    {children}
  </span>
);

const UserChip: FC<{ user: GallerySubmittedUser }> = ({ user }) => (
  <span className="inline-flex items-center gap-1.5 flex-wrap">
    <img src={userAvatarUrl(user.id, user.avatar_url)} alt="" className="w-4 h-4 rounded-full" />
    {user.username}
    <IdText title="Discord user ID">{user.id}</IdText>
  </span>
);

const BlacklistWarning: FC<{ to: string; children: ReactNode }> = ({ to, children }) => (
  <p>
    {children}{" "}
    <Link to={to} className="underline hover:text-red-200">
      View blacklist
    </Link>
  </p>
);

interface GalleryPreviewModalProps {
  listing: AdminGallerySubmission | null;
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
  const reviewedDate = listing?.reviewed_at
    ? new Date(listing.reviewed_at).toLocaleString("en-GB", {
        dateStyle: "long",
        timeStyle: "short",
      })
    : "";
  const hasWarnings =
    listing?.server_blacklisted ||
    listing?.submitter_gallery_blacklisted ||
    listing?.source_guild_gallery_blacklisted;

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

          {hasWarnings && (
            <div className="mb-4 bg-red-600/10 border border-red-600/20 rounded p-3 text-sm text-red-300 space-y-1.5">
              <p className="font-medium">Staff-only warnings</p>
              {listing.server_blacklisted && (
                <BlacklistWarning to="/admin/server-blacklist">
                  This server is on the Server Blacklist, so it cannot use the bot.
                </BlacklistWarning>
              )}
              {listing.submitter_gallery_blacklisted && (
                <BlacklistWarning to="/admin/submission-blacklist/gallery">
                  The submitter is on the Gallery Blacklist and cannot submit or resubmit.
                  Blacklisting does not remove listings they already sent.
                </BlacklistWarning>
              )}
              {listing.source_guild_gallery_blacklisted && (
                <BlacklistWarning to="/admin/submission-blacklist/gallery">
                  This server is on the Gallery Blacklist and cannot submit or resubmit.
                  Blacklisting does not remove listings it already sent.
                </BlacklistWarning>
              )}
            </div>
          )}

          <PreviewBody listing={listing} view={view} onViewChange={setView} />

          <dl className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <MetaRow label="Listing ID">
              <IdText title="Gallery listing ID">#{listing.id}</IdText>
            </MetaRow>
            <MetaRow label="Category">{listing.category}</MetaRow>
            <MetaRow label="Status">
              <span className="capitalize">{listing.status}</span>
            </MetaRow>
            <MetaRow label="Featured">{listing.featured ? "Yes" : "No"}</MetaRow>
            <MetaRow label="Submitted by">
              <UserChip user={listing.submitted_user} />
            </MetaRow>
            <MetaRow label="Submitted">{createdDate}</MetaRow>
            {listing.reviewed_by && (
              <MetaRow label={REVIEW_LABEL[listing.status]}>
                <UserChip user={listing.reviewed_by} />
                {reviewedDate && <span className="text-gray-400"> &middot; {reviewedDate}</span>}
              </MetaRow>
            )}
            <MetaRow label="Source server">
              <span className="inline-flex items-center gap-1.5 flex-wrap">
                <ImageWithFallback
                  src={
                    listing.source_guild_icon
                      ? guildIconUrl(listing.source_guild_id, listing.source_guild_icon)
                      : null
                  }
                  alt=""
                  className="w-4 h-4 rounded"
                  fallbackIcon={faServer}
                  fallbackIconClassName="text-gray-400 text-[8px]"
                />
                {listing.source_guild_name ?? "Unknown Server"}
                <IdText title="Discord server ID">{listing.source_guild_id}</IdText>
              </span>
            </MetaRow>
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
