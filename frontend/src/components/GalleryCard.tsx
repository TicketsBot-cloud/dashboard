import type { FC } from "react";
import Button from "@/components/Button";
import type { GalleryListing, GalleryTagSnapshot } from "@/types";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faDownload, faStar } from "@fortawesome/free-solid-svg-icons";
import { Link } from "react-router";
import { GALLERY_TYPE_BADGES } from "@/components/gallery/GalleryListingPreview";

interface GalleryCardProps {
  listing: GalleryListing;
  onImport?: (listing: GalleryListing) => void;
  onSelect?: (listing: GalleryListing) => void;
  selected?: boolean;
  actionLabel?: string;
}

const BODY_CLASS =
  "group flex flex-col flex-1 p-4 text-left transition-colors hover:bg-gray-700/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-inset";

function getColourHex(listing: GalleryListing): string {
  const type = listing.listing_type || "panel";

  if (type === "tag") {
    const snapshot = listing.snapshot_data as GalleryTagSnapshot | undefined;
    const embedColour = snapshot?.embed?.colour;
    const colour = embedColour ?? 0x14b8a6;
    return "#" + colour.toString(16).padStart(6, "0");
  }

  if (type === "form") {
    return "#" + (0xf97316).toString(16).padStart(6, "0");
  }

  return "#" + listing.colour.toString(16).padStart(6, "0");
}

function getContentPreview(listing: GalleryListing): string {
  return listing.description;
}

const GalleryCard: FC<GalleryCardProps> = ({
  listing,
  onImport,
  onSelect,
  selected = false,
  actionLabel = "Import",
}) => {
  const colourHex = getColourHex(listing);
  const type = listing.listing_type || "panel";
  const badge = GALLERY_TYPE_BADGES[type];

  const body = (
    <>
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="text-white font-semibold text-lg truncate transition-colors group-hover:text-blue-400">
          {listing.featured && (
            <FontAwesomeIcon icon={faStar} className="text-yellow-400 mr-2" aria-label="Featured" />
          )}
          {listing.name}
        </h3>
        {badge && (
          <span
            className={badge.className + " rounded-full px-2 py-0.5 text-xs font-medium shrink-0"}
          >
            {badge.label}
          </span>
        )}
      </div>

      <p className="text-gray-300 text-sm line-clamp-3 mb-3 flex-1">{getContentPreview(listing)}</p>

      <div className="flex flex-wrap gap-2">
        <span className="bg-blue-600/20 text-blue-400 rounded-full px-2.5 py-0.5 text-xs font-medium">
          {listing.category}
        </span>
        {listing.tags.map((tag) => (
          <span key={tag} className="bg-gray-700 text-gray-300 rounded px-2 py-0.5 text-xs">
            {tag}
          </span>
        ))}
      </div>
    </>
  );

  return (
    <article
      className={`bg-gray-800 rounded-lg border border-gray-700 overflow-hidden transition-colors flex flex-col border-l-4 ${selected ? "ring-2 ring-blue-500" : ""}`}
      style={{ borderLeftColor: colourHex }}
      aria-label={`Template: ${listing.name}`}
    >
      {onSelect ? (
        <button
          type="button"
          className={BODY_CLASS + " w-full"}
          onClick={() => onSelect(listing)}
          aria-pressed={selected}
        >
          {body}
        </button>
      ) : (
        <Link to={`/gallery/${listing.id}`} className={BODY_CLASS}>
          {body}
        </Link>
      )}

      <div className="flex items-center justify-between gap-2 text-sm border-t border-gray-700 px-4 py-3">
        <div className="flex items-center gap-3">
          {listing.import_count >= 5 ? (
            <span
              className="text-gray-400 flex items-center gap-1"
              aria-label={`${listing.import_count} imports`}
            >
              <FontAwesomeIcon icon={faDownload} className="text-xs" aria-hidden="true" />
              <span aria-hidden="true">{listing.import_count}</span>
            </span>
          ) : (
            <span className="bg-green-600/20 text-green-400 rounded-full px-2 py-0.5 text-xs font-medium">
              New
            </span>
          )}
          <span className="text-gray-400 flex items-center gap-1.5">
            {listing.submitted_user.avatar_url ? (
              <img
                src={listing.submitted_user.avatar_url}
                alt=""
                className="w-4 h-4 rounded-full"
              />
            ) : null}
            {listing.submitted_user.username}
          </span>
        </div>

        {onImport && (
          <Button
            variant="primary"
            size="sm"
            onClick={() => onImport(listing)}
            className="font-medium"
            aria-label={`${actionLabel} ${listing.name}`}
            title={`${actionLabel} ${listing.name}`}
          >
            <FontAwesomeIcon icon={faDownload} aria-hidden="true" />
            {actionLabel}
          </Button>
        )}
      </div>
    </article>
  );
};

export default GalleryCard;
