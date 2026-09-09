import type { FC, ReactNode } from "react";
import DiscordText from "@/components/discord/DiscordText";
import { parseDiscordMarkdown } from "@/lib/discord-markdown";
import EmbedPreview from "@/components/EmbedPreview";
import DiscordButton from "@/components/discord/container/Button";
import type {
  GalleryListing,
  GalleryTagSnapshot,
  GalleryFormSnapshot,
  GalleryFormInputSnapshot,
} from "@/types";

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

export const GALLERY_TYPE_BADGES: Record<
  string,
  { label: string; plural: string; className: string; dot: string }
> = {
  panel: {
    label: "Panel",
    plural: "Panels",
    className: "bg-purple-600/20 text-purple-400",
    dot: "#C27AFF",
  },
  tag: { label: "Tag", plural: "Tags", className: "bg-teal-600/20 text-teal-400", dot: "#00D5BE" },
  form: {
    label: "Form",
    plural: "Forms",
    className: "bg-orange-600/20 text-orange-400",
    dot: "#FF8904",
  },
};

export const GALLERY_TYPE_OPTIONS = Object.entries(GALLERY_TYPE_BADGES).map(([key, badge]) => ({
  key,
  label: badge.plural,
  color: badge.dot,
}));

// Anything the parser leaves as plain text renders identically either way.
function hasMarkdown(content: string | undefined): boolean {
  if (!content) return false;

  const source = content.replace(/\r\n?/g, "\n");
  let plain = "";
  for (const node of parseDiscordMarkdown(source)) {
    if (node.type !== "text") return true;
    plain += node.value;
  }
  return plain !== source;
}

// Only the text EmbedPreview and TagListingPreview pass through DiscordText.
// Form labels and placeholders are not markdown surfaces in Discord.
function markdownFields(listing: GalleryListing): (string | undefined)[] {
  const listingType = listing.listing_type || "panel";

  if (listingType === "form") {
    return [];
  }

  if (listingType === "tag") {
    const snapshot = listing.snapshot_data as GalleryTagSnapshot | undefined;
    const embed = snapshot?.embed;
    return [
      snapshot?.content,
      embed?.title,
      embed?.description,
      ...(embed?.fields ?? []).flatMap((field) => [field.name, field.value]),
    ];
  }

  const welcomeMessage = listing.welcome_message;
  return [
    listing.title,
    listing.content,
    welcomeMessage?.title,
    welcomeMessage?.description,
    ...(welcomeMessage?.fields ?? []).flatMap((field) => [field.name, field.value]),
  ];
}

export function listingHasMarkdown(listing: GalleryListing): boolean {
  return markdownFields(listing).some(hasMarkdown);
}

const PreviewSection: FC<{ title: string; children: ReactNode }> = ({ title, children }) => (
  <div className="bg-gray-800 rounded-xl p-6">
    <h2 className="text-sm font-medium text-gray-400 mb-3 uppercase tracking-wider">{title}</h2>
    {children}
  </div>
);

const PanelListingPreview: FC<{ listing: GalleryListing; raw: boolean }> = ({ listing, raw }) => {
  const welcomeMessage = listing.welcome_message;

  return (
    <>
      <PreviewSection title="Panel Preview">
        <EmbedPreview
          raw={raw}
          embed={{
            title: listing.title,
            description: listing.content,
            colour: listing.colour,
            image_url: listing.image_url,
            thumbnail_url: listing.thumbnail_url,
          }}
        />
        <div className="mt-4">
          <DiscordButton
            button_style={listing.button_style ?? 1}
            label={listing.button_label || "Open Ticket"}
            emoji={listing.emoji_name ? { name: listing.emoji_name } : undefined}
          />
        </div>
      </PreviewSection>

      {welcomeMessage && (
        <PreviewSection title="Welcome Message">
          <EmbedPreview
            raw={raw}
            embed={{
              ...welcomeMessage,
              colour: parseInt(welcomeMessage.colour, 10) || listing.colour,
            }}
          />
        </PreviewSection>
      )}
    </>
  );
};

const TagListingPreview: FC<{ listing: GalleryListing; raw: boolean }> = ({ listing, raw }) => {
  const snapshot = listing.snapshot_data as GalleryTagSnapshot | undefined;

  if (!snapshot) {
    return (
      <PreviewSection title="Tag Preview">
        <p className="text-gray-400 text-sm">No preview data available.</p>
      </PreviewSection>
    );
  }

  return (
    <PreviewSection title="Tag Preview">
      {snapshot.content && (
        <DiscordText
          raw={raw}
          content={snapshot.content}
          className="text-gray-300 text-sm mb-4 bg-gray-900 rounded p-3"
        />
      )}
      {snapshot.embed && (
        <EmbedPreview
          raw={raw}
          embed={{ ...snapshot.embed, colour: snapshot.embed.colour || 0x14b8a6 }}
        />
      )}
    </PreviewSection>
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

const FormListingPreview: FC<{ listing: GalleryListing }> = ({ listing }) => {
  const snapshot = listing.snapshot_data as GalleryFormSnapshot | undefined;

  if (!snapshot) {
    return (
      <PreviewSection title="Form Preview">
        <p className="text-gray-400 text-sm">No preview data available.</p>
      </PreviewSection>
    );
  }

  const sortedInputs = [...(snapshot.inputs || [])].sort((a, b) => a.position - b.position);

  return (
    <PreviewSection title="Form Preview">
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
    </PreviewSection>
  );
};

interface GalleryListingPreviewProps {
  listing: GalleryListing;
  raw?: boolean;
}

const GalleryListingPreview: FC<GalleryListingPreviewProps> = ({ listing, raw = false }) => {
  switch (listing.listing_type || "panel") {
    case "tag":
      return <TagListingPreview listing={listing} raw={raw} />;
    case "form":
      return <FormListingPreview listing={listing} />;
    default:
      return <PanelListingPreview listing={listing} raw={raw} />;
  }
};

export default GalleryListingPreview;
