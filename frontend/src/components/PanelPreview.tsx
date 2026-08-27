import type { FC } from "react";
import Button from "@/components/discord/container/Button";
import SelectMenu from "@/components/discord/container/SelectMenu";
import DiscordContent from "@/components/discord/DiscordContent";
import type { Panel, MultiPanel, MultiPanelRequest } from "@/types";
import { formatEmbedTimestampForDisplay } from "@/lib/embed-timestamp";
import { isSafeUrl } from "@/lib/url";
import { previewAvatarUrl } from "@/lib/embed-avatar";

function resolveEmoteName(emote: Panel["emote"] | undefined): string {
  if (typeof emote === "string") return emote;
  if (emote && typeof emote === "object") return emote.name;
  return "";
}

type MultiPanelPreviewRequest = Omit<MultiPanelRequest, "channel_id"> &
  Partial<Pick<MultiPanelRequest, "channel_id">>;

interface PanelPreviewProps {
  type: "panel" | "welcome";
  data: {
    panel: Panel | MultiPanel | MultiPanelRequest | MultiPanelPreviewRequest;
    buttons?: Panel[];
  };
}

const PanelPreview: FC<PanelPreviewProps> = ({ type, data }) => {
  const { panel, buttons } = data;

  if (type === "panel") {
    const p = panel as Panel;
    return (
      <>
        <div
          className="bg-[#2b2d31] rounded border-l-4 p-3 w-full sm:max-w-130 mt-4"
          style={{
            borderLeftColor: `#${(p.colour || 0x5865f2).toString(16).padStart(6, "0")}`,
          }}
        >
          <div className="flex">
            <div className="flex-1 min-w-0">
              <DiscordContent content={p.title} className="text-base font-semibold text-white" />
              <DiscordContent
                content={p.content}
                className="text-sm mt-1 text-[#dbdee1] leading-snug"
              />
            </div>
            {p.thumbnail_url && (
              <div className="ml-4 shrink-0">
                <img
                  src={p.thumbnail_url}
                  alt="Thumbnail"
                  className="w-20 h-20 rounded-sm object-contain"
                />
              </div>
            )}
          </div>
          {p.image_url && (
            <div className="mt-3">
              <img src={p.image_url} alt="Embedded" className="w-full h-auto rounded-sm" />
            </div>
          )}
        </div>
        {buttons && buttons.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-1">
            {buttons.map((bp, index) => (
              <Button
                key={bp.panel_id ?? index}
                button_style={parseInt(bp.button_style) || 1}
                label={bp.button_label || "Open Ticket"}
                disabled={bp.disabled}
                emoji={
                  bp.use_custom_emoji
                    ? bp.emoji_id
                      ? {
                          name: resolveEmoteName(bp.emote),
                          id: bp.emoji_id,
                          animated: bp.emoji_animated,
                        }
                      : undefined
                    : resolveEmoteName(bp.emote)
                      ? { name: resolveEmoteName(bp.emote) }
                      : undefined
                }
              />
            ))}
          </div>
        )}
      </>
    );
  }

  // For MultiPanel or MultiPanelRequest
  const isMultiPanelRequest = "embed" in panel && !("welcome_message" in panel);
  const embedData = isMultiPanelRequest
    ? (panel as MultiPanelRequest).embed
    : (panel as Panel).welcome_message;

  const resolveTicketAvatar = (url: string | null | undefined) =>
    isMultiPanelRequest ? url : previewAvatarUrl(url);

  const borderColor = isMultiPanelRequest
    ? `#${((panel as MultiPanelRequest).embed.colour || 0x5865f2).toString(16).padStart(6, "0")}`
    : typeof embedData?.colour === "number"
      ? `#${embedData.colour.toString(16).padStart(6, "0")}`
      : embedData?.colour || "#5865f2";

  const footerText = embedData?.footer
    ? typeof embedData.footer === "string"
      ? embedData.footer
      : embedData.footer.text || ""
    : null;

  const footerIconUrlRaw =
    embedData?.footer && typeof embedData.footer !== "string" ? embedData.footer.icon_url : null;
  const footerIconUrl = resolveTicketAvatar(footerIconUrlRaw);
  const footerTimestamp = formatEmbedTimestampForDisplay(embedData?.timestamp);

  const thumbnailUrl = resolveTicketAvatar(embedData?.thumbnail_url);
  const imageUrl = resolveTicketAvatar(embedData?.image_url);
  const authorIconUrl = resolveTicketAvatar(embedData?.author?.icon_url);
  const authorUrl = resolveTicketAvatar(embedData?.author?.url);
  const titleUrl = resolveTicketAvatar(embedData?.url);

  return (
    <>
      <div
        className="bg-[#2b2d31] rounded border-l-4 p-3 w-full sm:max-w-130 mt-4"
        style={{ borderLeftColor: borderColor }}
      >
        <div className="flex">
          <div className="flex-1 min-w-0">
            {authorUrl && isSafeUrl(authorUrl) ? (
              <a
                href={authorUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 mb-2"
              >
                {authorIconUrl && (
                  <img src={authorIconUrl} alt="Author Icon" className="w-6 h-6 rounded-full" />
                )}
                <span className="text-sm font-semibold text-[#dbdee1] hover:underline">
                  {embedData?.author?.name}
                </span>
              </a>
            ) : embedData?.author?.name ? (
              <div className="flex items-center gap-2 mb-2">
                {authorIconUrl && (
                  <img src={authorIconUrl} alt="Author Icon" className="w-6 h-6 rounded-full" />
                )}
                <span className="text-sm font-semibold text-[#dbdee1]">
                  {embedData.author.name}
                </span>
              </div>
            ) : null}
            {embedData?.title &&
              (titleUrl && isSafeUrl(titleUrl) ? (
                <a href={titleUrl} target="_blank" rel="noopener noreferrer">
                  <DiscordContent
                    content={embedData.title}
                    className="text-base font-semibold text-[#00a8fc] hover:underline"
                  />
                </a>
              ) : (
                <DiscordContent
                  content={embedData.title}
                  className="text-base font-semibold text-white"
                />
              ))}
            {embedData?.description && (
              <DiscordContent
                content={embedData.description}
                className="text-sm mt-1 text-[#dbdee1] leading-snug"
              />
            )}
          </div>
          {thumbnailUrl && (
            <div className="ml-4 shrink-0">
              <img
                src={thumbnailUrl}
                alt="Thumbnail"
                className="w-20 h-20 rounded-sm object-contain"
              />
            </div>
          )}
        </div>
        {imageUrl && (
          <div className="mt-3">
            <img src={imageUrl} alt="Embedded" className="w-full h-auto rounded-sm" />
          </div>
        )}
        {(footerText || footerTimestamp) && (
          <div className="mt-3 flex items-center gap-2">
            {footerIconUrl && (
              <img src={footerIconUrl} alt="Footer Icon" className="w-5 h-5 rounded-full" />
            )}
            <p className="text-xs text-[#dbdee1]">
              {footerText}
              {footerText && footerTimestamp ? " • " : ""}
              {footerTimestamp}
            </p>
          </div>
        )}
      </div>
      {buttons &&
        buttons.length > 0 &&
        (() => {
          const mp = panel as MultiPanel | MultiPanelRequest;
          if (mp.select_menu) {
            const options = buttons.map((bp) => {
              const entry = mp.panels.find((e) => e.panel_id === bp.panel_id);
              const emoji = bp.use_custom_emoji
                ? bp.emoji_id
                  ? {
                      name: resolveEmoteName(bp.emote),
                      id: bp.emoji_id,
                      animated: bp.emoji_animated,
                    }
                  : undefined
                : resolveEmoteName(bp.emote)
                  ? { name: resolveEmoteName(bp.emote) }
                  : undefined;
              return {
                value: String(bp.panel_id),
                label: bp.button_label || "Open Ticket",
                description: entry?.description,
                emoji,
              };
            });
            return (
              <div className="mt-1 w-full sm:max-w-130">
                <SelectMenu
                  open
                  placeholder={mp.select_menu_placeholder || "Select a topic..."}
                  options={options}
                />
              </div>
            );
          }
          return (
            <div className="flex flex-wrap gap-2 mt-1">
              {buttons.map((p, index) => (
                <Button
                  key={p.panel_id ?? index}
                  button_style={parseInt(p.button_style) || 1}
                  label={p.button_label || "Open Ticket"}
                  emoji={
                    p.use_custom_emoji
                      ? p.emoji_id
                        ? {
                            name: resolveEmoteName(p.emote),
                            id: p.emoji_id,
                            animated: p.emoji_animated,
                          }
                        : undefined
                      : resolveEmoteName(p.emote)
                        ? { name: resolveEmoteName(p.emote) }
                        : undefined
                  }
                />
              ))}
            </div>
          );
        })()}
    </>
  );
};

export default PanelPreview;
