import type { FC } from "react";
import { isSafeUrl } from "@/lib/url";
import { formatEmbedTimestampForDisplay } from "@/lib/embed-timestamp";
import DiscordContent from "@/components/discord/DiscordContent";
import { previewAvatarUrl } from "@/lib/embed-avatar";

interface EmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

interface EmbedPreviewData {
  title?: string;
  description?: string;
  url?: string;
  colour: number;
  author?: { name?: string; icon_url?: string; url?: string };
  image_url?: string;
  thumbnail_url?: string;
  footer?: { text?: string; icon_url?: string };
  timestamp?: string;
  fields?: EmbedField[];
}

interface EmbedPreviewProps {
  embed: EmbedPreviewData;
}

const EmbedPreview: FC<EmbedPreviewProps> = ({ embed }) => {
  const borderColor = `#${(embed.colour || 0x5865f2).toString(16).padStart(6, "0")}`;
  const footerTimestamp = formatEmbedTimestampForDisplay(embed.timestamp);
  const thumbnailUrl = previewAvatarUrl(embed.thumbnail_url);
  const imageUrl = previewAvatarUrl(embed.image_url);
  const authorIconUrl = previewAvatarUrl(embed.author?.icon_url);
  const authorUrl = previewAvatarUrl(embed.author?.url);
  const footerIconUrl = previewAvatarUrl(embed.footer?.icon_url);

  // Group fields into rows: inline fields share a row (max 3), non-inline get their own
  const fieldRows: EmbedField[][] = [];
  if (embed.fields?.length) {
    let currentRow: EmbedField[] = [];
    for (const field of embed.fields) {
      if (field.inline) {
        currentRow.push(field);
        if (currentRow.length === 3) {
          fieldRows.push(currentRow);
          currentRow = [];
        }
      } else {
        if (currentRow.length > 0) {
          fieldRows.push(currentRow);
          currentRow = [];
        }
        fieldRows.push([field]);
      }
    }
    if (currentRow.length > 0) {
      fieldRows.push(currentRow);
    }
  }

  return (
    <div
      className="bg-[#242429] rounded border-l-5 p-3 min-h-25 w-full sm:max-w-150 mt-4 relative"
      style={{ borderLeftColor: borderColor }}
    >
      <div className="flex">
        <div className="flex-1">
          {authorUrl && isSafeUrl(authorUrl) ? (
            <a
              href={authorUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center space-x-2 mb-2"
            >
              {authorIconUrl && (
                <img src={authorIconUrl} alt="Author Icon" className="w-5 h-5 rounded-full" />
              )}
              <span className="text-sm font-semibold text-blue-400 hover:underline">
                {embed.author?.name}
              </span>
            </a>
          ) : embed.author?.name ? (
            <div className="flex items-center space-x-2 mb-2">
              {authorIconUrl && (
                <img src={authorIconUrl} alt="Author Icon" className="w-5 h-5 rounded-full" />
              )}
              <span className="text-sm font-semibold">{embed.author.name}</span>
            </div>
          ) : null}
          <DiscordContent content={embed.title || ""} className="text-sm font-bold" />
          {embed.description && (
            <DiscordContent content={embed.description} className="text-sm pt-2" />
          )}
          {fieldRows.length > 0 && (
            <div className="mt-2 flex flex-col gap-2">
              {fieldRows.map((row, ri) => (
                <div
                  key={ri}
                  className="grid gap-2"
                  style={{
                    gridTemplateColumns: row.length > 1 ? `repeat(${row.length}, 1fr)` : "1fr",
                  }}
                >
                  {row.map((field, fi) => (
                    <div key={fi} className="min-w-0">
                      <DiscordContent content={field.name} className="text-xs font-semibold" />
                      <DiscordContent content={field.value} className="text-xs text-gray-300" />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
        {thumbnailUrl && (
          <div className="ml-4 shrink-0">
            <img src={thumbnailUrl} alt="Thumbnail" className="w-20 h-20 rounded object-cover" />
          </div>
        )}
      </div>
      {imageUrl && (
        <div className="mt-2">
          <img src={imageUrl} alt="Embedded" className="w-full max-h-60 rounded object-cover" />
        </div>
      )}
      {(embed.footer?.text || footerTimestamp) && (
        <div className="mt-4 pt-2 border-t border-gray-700 flex items-center space-x-2">
          {footerIconUrl && (
            <img src={footerIconUrl} alt="Footer Icon" className="w-4 h-4 rounded-full" />
          )}
          <p className="text-xs text-gray-400">
            {embed.footer?.text}
            {embed.footer?.text && footerTimestamp ? " • " : ""}
            {footerTimestamp}
          </p>
        </div>
      )}
    </div>
  );
};

export default EmbedPreview;
