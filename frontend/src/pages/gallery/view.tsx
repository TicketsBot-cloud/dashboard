import { useEffect, useState, type FC } from "react";
import { useParams, Link } from "react-router";
import { MainLayout } from "@/pages/layout/Main";
import Button from "@/components/Button";
import { apiClient } from "@/lib/api";
import type { GalleryListing } from "@/types";
import GalleryImportModal from "@/components/modals/GalleryImportModal";
import GalleryImportTagModal from "@/components/modals/GalleryImportTagModal";
import GalleryImportFormModal from "@/components/modals/GalleryImportFormModal";
import DetailSkeleton from "@/components/skeletons/DetailSkeleton";
import GalleryListingPreview, {
  GALLERY_TYPE_BADGES,
} from "@/components/gallery/GalleryListingPreview";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowLeft,
  faDownload,
  faStar,
  faClock,
  faUser,
} from "@fortawesome/free-solid-svg-icons";

function getImportButtonLabel(type: string): string {
  if (type === "tag") return "Import Tag";
  if (type === "form") return "Import Form";
  return "Import Panel";
}

const GalleryViewPage: FC = () => {
  const { listingId } = useParams();
  const [listing, setListing] = useState<GalleryListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [importOpen, setImportOpen] = useState(false);

  useEffect(() => {
    if (!listingId) return;
    setLoading(true);
    apiClient.gallery
      .getById(Number(listingId))
      .then((res) => setListing(res.data))
      .catch(() => {
        // Error handled by interceptor
      })
      .finally(() => setLoading(false));
  }, [listingId]);

  if (loading) {
    return (
      <MainLayout title="Template Gallery">
        <DetailSkeleton />
      </MainLayout>
    );
  }

  if (!listing) {
    return (
      <MainLayout title="Template Gallery">
        <div className="text-center py-16">
          <p className="text-gray-400 text-lg mb-4">Listing not found.</p>
          <Link to="/gallery" className="text-blue-400 hover:text-blue-300">
            Back to Gallery
          </Link>
        </div>
      </MainLayout>
    );
  }

  const listingType = listing.listing_type || "panel";
  const badge = GALLERY_TYPE_BADGES[listingType];
  const createdDate = new Date(listing.created_at).toLocaleDateString("en-GB", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <MainLayout title="Template Gallery">
      <div className="mb-6">
        <Link
          to="/gallery"
          className="text-gray-400 hover:text-white transition-colors text-sm flex items-center gap-2"
        >
          <FontAwesomeIcon icon={faArrowLeft} aria-hidden="true" />
          Back to Gallery
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          <GalleryListingPreview listing={listing} />
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Listing info */}
          <div className="bg-gray-800 rounded-xl p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                  {listing.featured && (
                    <FontAwesomeIcon
                      icon={faStar}
                      className="text-yellow-400"
                      aria-label="Featured"
                    />
                  )}
                  {listing.name}
                </h2>
                <p className="text-gray-400 text-sm mt-1">{listing.description}</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 mb-4">
              {badge && (
                <span
                  className={badge.className + " rounded-full px-2.5 py-0.5 text-xs font-medium"}
                >
                  {badge.label}
                </span>
              )}
              <span className="bg-blue-600/20 text-blue-400 rounded-full px-2.5 py-0.5 text-xs font-medium">
                {listing.category}
              </span>
              {listing.tags.map((tag) => (
                <span key={tag} className="bg-gray-700 text-gray-300 rounded px-2 py-0.5 text-xs">
                  {tag}
                </span>
              ))}
            </div>

            <div className="space-y-2 text-sm text-gray-400 mb-6">
              <div className="flex items-center gap-2">
                {listing.submitted_user.avatar_url ? (
                  <img
                    src={listing.submitted_user.avatar_url}
                    alt=""
                    className="w-5 h-5 rounded-full"
                  />
                ) : (
                  <FontAwesomeIcon icon={faUser} className="w-4" aria-hidden="true" />
                )}
                <span>{listing.submitted_user.username}</span>
              </div>
              <div className="flex items-center gap-2">
                <FontAwesomeIcon icon={faDownload} className="w-4" aria-hidden="true" />
                <span>{listing.import_count} imports</span>
              </div>
              <div className="flex items-center gap-2">
                <FontAwesomeIcon icon={faClock} className="w-4" aria-hidden="true" />
                <span>{createdDate}</span>
              </div>
            </div>

            <Button
              variant="primary"
              onClick={() => setImportOpen(true)}
              className="w-full font-medium"
            >
              <FontAwesomeIcon icon={faDownload} className="mr-2" aria-hidden="true" />
              {getImportButtonLabel(listingType)}
            </Button>
          </div>
        </div>
      </div>

      {listing && listingType === "tag" ? (
        <GalleryImportTagModal
          listing={listing}
          open={importOpen}
          onClose={() => setImportOpen(false)}
        />
      ) : listing && listingType === "form" ? (
        <GalleryImportFormModal
          listing={listing}
          open={importOpen}
          onClose={() => setImportOpen(false)}
        />
      ) : listing ? (
        <GalleryImportModal
          listing={listing}
          open={importOpen}
          onClose={() => setImportOpen(false)}
        />
      ) : null}
    </MainLayout>
  );
};

export default GalleryViewPage;
