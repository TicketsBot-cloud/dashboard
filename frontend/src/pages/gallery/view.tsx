import { useEffect, useState, type FC } from "react";
import { useParams, Link } from "react-router";
import { MainLayout } from "@/pages/layout/Main";
import Button from "@/components/Button";
import { apiClient } from "@/lib/api";
import type {
  GalleryListing,
  GalleryTagSnapshot,
  GalleryFormSnapshot,
  GalleryFormInputSnapshot,
} from "@/types";
import GalleryImportModal from "@/components/modals/GalleryImportModal";
import GalleryImportTagModal from "@/components/modals/GalleryImportTagModal";
import GalleryImportFormModal from "@/components/modals/GalleryImportFormModal";
import DetailSkeleton from "@/components/skeletons/DetailSkeleton";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowLeft,
  faDownload,
  faStar,
  faClock,
  faUser,
} from "@fortawesome/free-solid-svg-icons";

const FORM_INPUT_TYPE_NAMES: Record<number, string> = {
  3: "Dropdown",
  4: "Text",
  5: "User Select",
  6: "Role Select",
  7: "Mentionable Select",
  8: "Channel Select",
  21: "Radio Group",
  22: "Checkbox Group",
};

const TYPE_BADGES: Record<string, { label: string; className: string }> = {
  panel: { label: "Panel", className: "bg-purple-600/20 text-purple-400" },
  tag: { label: "Tag", className: "bg-teal-600/20 text-teal-400" },
  form: { label: "Form", className: "bg-orange-600/20 text-orange-400" },
};

function getImportButtonLabel(type: string): string {
  if (type === "tag") return "Import Tag";
  if (type === "form") return "Import Form";
  return "Import Panel";
}

const PanelPreview: FC<{ listing: GalleryListing }> = ({ listing }) => {
  const colourHex = "#" + listing.colour.toString(16).padStart(6, "0");

  return (
    <>
      <div className="bg-gray-800 rounded-xl p-6">
        <h2 className="text-sm font-medium text-gray-400 mb-3 uppercase tracking-wider">
          Panel Preview
        </h2>
        <div
          className="bg-gray-900 border-l-4 rounded-r p-4 max-w-lg"
          style={{ borderLeftColor: colourHex }}
        >
          {listing.title && (
            <h3 className="text-white font-semibold text-lg mb-2">{listing.title}</h3>
          )}
          {listing.content && (
            <p className="text-gray-300 text-sm whitespace-pre-wrap">{listing.content}</p>
          )}
          {listing.image_url && (
            <img
              src={listing.image_url}
              alt={`${listing.name} embed preview`}
              className="rounded mt-3 max-w-full max-h-72 object-contain"
            />
          )}
          {listing.thumbnail_url && (
            <img
              src={listing.thumbnail_url}
              alt={`Thumbnail for ${listing.name}`}
              className="rounded mt-3 w-20 h-20 object-cover"
            />
          )}
        </div>

        {/* Button preview */}
        <div className="mt-4" aria-hidden="true">
          <div
            role="presentation"
            className={`inline-block px-4 py-2 rounded text-sm font-medium ${
              listing.button_style === 1
                ? "bg-blue-600 text-white"
                : listing.button_style === 2
                  ? "bg-gray-600 text-white"
                  : listing.button_style === 3
                    ? "bg-green-600 text-white"
                    : listing.button_style === 4
                      ? "bg-red-600 text-white"
                      : "bg-blue-600 text-white"
            }`}
          >
            {listing.emoji_name && <span className="mr-1">{listing.emoji_name}</span>}
            {listing.button_label || "Open Ticket"}
          </div>
        </div>
      </div>

      {/* Welcome message preview */}
      {listing.welcome_message && (
        <div className="bg-gray-800 rounded-xl p-6">
          <h2 className="text-sm font-medium text-gray-400 mb-3 uppercase tracking-wider">
            Welcome Message
          </h2>
          <div
            className="bg-gray-900 border-l-4 rounded-r p-4 max-w-lg"
            style={{
              borderLeftColor: listing.welcome_message.colour
                ? `#${parseInt(listing.welcome_message.colour).toString(16).padStart(6, "0")}`
                : colourHex,
            }}
          >
            {listing.welcome_message.title && (
              <h3 className="text-white font-semibold text-lg mb-2">
                {listing.welcome_message.title}
              </h3>
            )}
            {listing.welcome_message.description && (
              <p className="text-gray-300 text-sm whitespace-pre-wrap">
                {listing.welcome_message.description}
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
};

const TagPreview: FC<{ listing: GalleryListing }> = ({ listing }) => {
  const snapshot = listing.snapshot_data as GalleryTagSnapshot | undefined;
  if (!snapshot) {
    return (
      <div className="bg-gray-800 rounded-xl p-6">
        <h2 className="text-sm font-medium text-gray-400 mb-3 uppercase tracking-wider">
          Tag Preview
        </h2>
        <p className="text-gray-400 text-sm">No preview data available.</p>
      </div>
    );
  }

  const embedColour = snapshot.embed?.colour ?? 0x14b8a6;
  const colourHex = "#" + embedColour.toString(16).padStart(6, "0");

  return (
    <div className="bg-gray-800 rounded-xl p-6">
      <h2 className="text-sm font-medium text-gray-400 mb-3 uppercase tracking-wider">
        Tag Preview
      </h2>

      {snapshot.content && (
        <p className="text-gray-300 text-sm whitespace-pre-wrap mb-4 bg-gray-900 rounded p-3">
          {snapshot.content}
        </p>
      )}

      {snapshot.embed && (
        <div
          className="bg-gray-900 border-l-4 rounded-r p-4 max-w-lg"
          style={{ borderLeftColor: colourHex }}
        >
          {snapshot.embed.title && (
            <h3 className="text-white font-semibold text-lg mb-2">{snapshot.embed.title}</h3>
          )}
          {snapshot.embed.description && (
            <p className="text-gray-300 text-sm whitespace-pre-wrap">
              {snapshot.embed.description}
            </p>
          )}
          {snapshot.embed.fields && snapshot.embed.fields.length > 0 && (
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
              {snapshot.embed.fields.map((field, i) => (
                <div key={i} className={field.inline ? "" : "col-span-full"}>
                  <p className="text-white text-xs font-semibold">{field.name}</p>
                  <p className="text-gray-400 text-xs">{field.value}</p>
                </div>
              ))}
            </div>
          )}
          {snapshot.embed.image_url && (
            <img
              src={snapshot.embed.image_url}
              alt="Embed preview"
              className="rounded mt-3 max-w-full max-h-72 object-contain"
            />
          )}
        </div>
      )}
    </div>
  );
};

const FormInputPreviewRow: FC<{ input: GalleryFormInputSnapshot }> = ({ input }) => {
  const typeName = FORM_INPUT_TYPE_NAMES[input.type] ?? `Type ${input.type}`;

  return (
    <div className="bg-gray-900 rounded p-3">
      <div className="flex items-start justify-between gap-2 mb-1">
        <span className="text-white text-sm font-medium">{input.label}</span>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-gray-400 text-xs">{typeName}</span>
          {input.required && (
            <span className="bg-red-600/20 text-red-400 rounded-full px-2 py-0.5 text-xs font-medium">
              Required
            </span>
          )}
        </div>
      </div>
      {input.description && <p className="text-gray-400 text-xs mt-1">{input.description}</p>}
      {input.placeholder && (
        <p className="text-gray-400 text-xs mt-1 italic">Placeholder: {input.placeholder}</p>
      )}
      {input.options && input.options.length > 0 && (
        <div className="mt-2 space-y-1">
          <p className="text-gray-400 text-xs font-medium">Options:</p>
          {input.options.map((opt, i) => (
            <div key={i} className="text-xs text-gray-400 pl-3">
              &bull; {opt.label}
              {opt.description ? ` - ${opt.description}` : ""}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const FormPreview: FC<{ listing: GalleryListing }> = ({ listing }) => {
  const snapshot = listing.snapshot_data as GalleryFormSnapshot | undefined;
  if (!snapshot) {
    return (
      <div className="bg-gray-800 rounded-xl p-6">
        <h2 className="text-sm font-medium text-gray-400 mb-3 uppercase tracking-wider">
          Form Preview
        </h2>
        <p className="text-gray-400 text-sm">No preview data available.</p>
      </div>
    );
  }

  const sortedInputs = [...(snapshot.inputs || [])].sort((a, b) => a.position - b.position);

  return (
    <div className="bg-gray-800 rounded-xl p-6">
      <h2 className="text-sm font-medium text-gray-400 mb-3 uppercase tracking-wider">
        Form Preview
      </h2>
      <h3 className="text-white font-semibold text-lg mb-4">{snapshot.title}</h3>
      {sortedInputs.length > 0 ? (
        <div className="space-y-3">
          {sortedInputs.map((input, i) => (
            <FormInputPreviewRow key={i} input={input} />
          ))}
        </div>
      ) : (
        <p className="text-gray-400 text-sm">No fields defined.</p>
      )}
    </div>
  );
};

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
  const badge = TYPE_BADGES[listingType];
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
          {listingType === "tag" ? (
            <TagPreview listing={listing} />
          ) : listingType === "form" ? (
            <FormPreview listing={listing} />
          ) : (
            <PanelPreview listing={listing} />
          )}
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
