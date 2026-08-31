import { useState, useEffect, type FC } from "react";
import ActionModal from "@/components/modal-primitives/ActionModal";
import Button from "@/components/Button";
import TextInput from "@/components/TextInput";
import Textarea from "@/components/Textarea";
import Slider from "@/components/Slider";
import Select from "@/components/Select";
import ColourSelect from "@/components/ColourSelect";
import Collapsible from "@/components/Collapsible";
import EmbedFieldsEditor from "@/components/EmbedFieldsEditor";
import EmbedPreview from "@/components/EmbedPreview";
import DateTimePicker from "@/components/DateTimePicker";
import { useKBArticles } from "@/hooks/queries/useKB";
import { parseEmbedTimestamp, serializeEmbedTimestamp } from "@/lib/embed-timestamp";
import type { Tag, TagEmbed } from "@/types";
import { EMBED_LIMITS } from "@/constants/embedLimits";
import { BRANDING_FOOTER_TEXT } from "@/lib/constants";
import EmbedCharacterTotal from "@/components/EmbedCharacterTotal";

interface TagEditorModalProps {
  isOpen: boolean;
  tag: Tag | null;
  isPremium: boolean;
  isClone?: boolean;
  guildId: string;
  /**
   * True while the 202608_FEATURE_TAGS kill switch is off. Keeps the form
   * editable so users don't lose in-progress edits, but blocks the Save
   * button so nothing can actually be submitted. See useFeatureLock.
   */
  locked?: boolean;
  onSave: (tag: Tag, originalId?: string) => void;
  onClose: () => void;
}

const defaultEmbed: TagEmbed = {
  colour: 0x5865f2,
  author: {},
  footer: {},
  fields: [],
};

const TagEditorModal: FC<TagEditorModalProps> = ({
  isOpen,
  tag,
  isPremium,
  isClone,
  guildId,
  locked = false,
  onSave,
  onClose,
}) => {
  const [id, setId] = useState("");
  const [useGuildCommand, setUseGuildCommand] = useState(false);
  const [content, setContent] = useState("");
  const [useEmbed, setUseEmbed] = useState(false);
  const [embed, setEmbed] = useState<TagEmbed>({ ...defaultEmbed });
  const [kbArticleId, setKbArticleId] = useState<number | null>(null);
  const [linkToKB, setLinkToKB] = useState(false);

  const { data: kbArticles } = useKBArticles(isOpen ? guildId : undefined);

  const isEditing = tag !== null && !isClone;
  const originalId = tag?.id;

  useEffect(() => {
    if (isOpen && tag && isClone) {
      const cloneId = tag.id.length <= 11 ? `${tag.id}-copy` : "";
      setId(cloneId);
      setUseGuildCommand(false);
      setContent(tag.content || "");
      setUseEmbed(tag.use_embed);
      setKbArticleId(null);
      setLinkToKB(false);
      setEmbed(
        tag.embed
          ? {
              ...defaultEmbed,
              ...tag.embed,
              colour: (() => {
                const c = tag.embed.colour;
                if (typeof c === "number") return c;
                const parsed = parseInt(String(c ?? "").replace(/^#/, ""), 16);
                return isNaN(parsed) ? defaultEmbed.colour : parsed;
              })(),
              author: { ...defaultEmbed.author, ...tag.embed.author },
              footer: { ...defaultEmbed.footer, ...tag.embed.footer },
              fields: tag.embed.fields?.length ? [...tag.embed.fields] : [],
            }
          : { ...defaultEmbed },
      );
    } else if (isOpen && tag) {
      setId(tag.id);
      setUseGuildCommand(tag.use_guild_command);
      setContent(tag.content || "");
      setUseEmbed(tag.use_embed);
      setKbArticleId(tag.kb_article_id ?? null);
      setLinkToKB(tag.kb_article_id != null);
      setEmbed(
        tag.embed
          ? {
              ...defaultEmbed,
              ...tag.embed,
              colour: (() => {
                const c = tag.embed.colour;
                if (typeof c === "number") return c;
                const parsed = parseInt(String(c ?? "").replace(/^#/, ""), 16);
                return isNaN(parsed) ? defaultEmbed.colour : parsed;
              })(),
              author: { ...defaultEmbed.author, ...tag.embed.author },
              footer: { ...defaultEmbed.footer, ...tag.embed.footer },
              fields: tag.embed.fields?.length ? [...tag.embed.fields] : [],
            }
          : { ...defaultEmbed },
      );
    } else if (isOpen) {
      setId("");
      setUseGuildCommand(false);
      setContent("");
      setUseEmbed(false);
      setKbArticleId(null);
      setLinkToKB(false);
      setEmbed({ ...defaultEmbed, author: {}, footer: {}, fields: [] });
    }
  }, [isOpen, tag, isClone]);

  const handleSave = () => {
    const tagData: Tag = {
      id: id.toLowerCase(),
      use_guild_command: useGuildCommand,
      content: linkToKB ? undefined : content || undefined,
      use_embed: linkToKB ? false : useEmbed,
      embed:
        !linkToKB && useEmbed
          ? {
              ...embed,
              title: embed.title || undefined,
              description: embed.description || undefined,
              url: embed.url || undefined,
              author: {
                name: embed.author?.name || undefined,
                icon_url: embed.author?.icon_url || undefined,
                url: embed.author?.url || undefined,
              },
              image_url: embed.image_url || undefined,
              thumbnail_url: embed.thumbnail_url || undefined,
              timestamp: embed.timestamp || undefined,
              footer: {
                text: embed.footer?.text || undefined,
                icon_url: embed.footer?.icon_url || undefined,
              },
            }
          : undefined,
      kb_article_id: linkToKB ? kbArticleId : null,
    };

    onSave(tagData, isEditing ? originalId : undefined);
  };

  const isValid = id.length >= 1 && id.length <= 16 && /^[a-z0-9_-]+$/.test(id);
  const hasContent = linkToKB ? kbArticleId != null : content || useEmbed;

  const linkedArticle = kbArticleId != null ? kbArticles?.find((a) => a.id === kbArticleId) : null;

  const kbArticleOptions = (kbArticles ?? [])
    .filter((a) => a.published)
    .map((a) => ({
      key: String(a.id),
      label: a.title,
    }));

  return (
    <ActionModal
      isOpen={isOpen}
      onClose={onClose}
      className="max-w-4xl max-h-[90vh] overflow-y-auto"
    >
      <div className="p-6">
        <h3 className="text-xl font-semibold mb-4">
          {isClone ? "Clone Tag" : isEditing ? "Edit Tag" : "Create Tag"}
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left: Form */}
          <div className="space-y-4">
            <TextInput
              label="Tag ID"
              placeholder="e.g. greeting"
              value={id}
              onChange={(v) => {
                const sanitised = v
                  .toLowerCase()
                  .replace(/[^a-z0-9_-]/g, "")
                  .slice(0, 16);
                setId(sanitised);
              }}
            />
            {id && !isValid && (
              <p className="text-xs text-red-400">
                Tag ID must be 1-16 characters, lowercase alphanumeric, hyphens, or underscores.
              </p>
            )}

            <Slider
              label={
                isPremium ? "Create Custom Command Alias" : "Create Custom Command Alias (Premium)"
              }
              value={useGuildCommand}
              onChange={setUseGuildCommand}
              disabled={!isPremium}
            />

            {/* KB Article linking */}
            {kbArticleOptions.length > 0 && (
              <div className="border-t border-gray-700 pt-4">
                <Slider
                  label="Link to Knowledge Base article"
                  value={linkToKB}
                  onChange={(v) => {
                    setLinkToKB(v);
                    if (!v) setKbArticleId(null);
                  }}
                />

                {linkToKB && (
                  <div className="mt-3">
                    <Select
                      label="Knowledge Base Article"
                      value={kbArticleId != null ? String(kbArticleId) : null}
                      options={kbArticleOptions}
                      onChange={(v) => setKbArticleId(v != null ? parseInt(v) : null)}
                      placeholder="Select an article..."
                    />
                    {linkedArticle && (
                      <p className="text-xs text-gray-300 mt-2">
                        Content from &ldquo;{linkedArticle.title}&rdquo; will be used when this tag
                        is invoked. The tag&rsquo;s own content/embed will be kept as a fallback.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Content editor - disabled when linked to KB */}
            {linkToKB ? (
              <div className="bg-gray-700/50 rounded-lg p-4 text-gray-300 text-sm">
                {linkedArticle ? (
                  <>
                    Content sourced from KB article: <strong>{linkedArticle.title}</strong>
                  </>
                ) : (
                  "Select a Knowledge Base article above to link this tag."
                )}
              </div>
            ) : (
              <>
                <Textarea
                  label="Message Content"
                  value={content}
                  onChange={setContent}
                  max={2000}
                />

                <Slider label="Use Embed" value={useEmbed} onChange={setUseEmbed} />

                {useEmbed && (
                  <div className="space-y-3">
                    <div className="grid gap-2 grid-cols-1 md:grid-cols-2">
                      <TextInput
                        label="Title"
                        placeholder="Embed title"
                        value={embed.title || ""}
                        onChange={(v) => setEmbed((prev) => ({ ...prev, title: v }))}
                        maxLength={EMBED_LIMITS.TITLE}
                        showCount
                      />
                      <ColourSelect
                        label="Colour"
                        value={`#${(embed.colour || 0x5865f2).toString(16).padStart(6, "0")}`}
                        onChange={(v) =>
                          setEmbed((prev) => ({
                            ...prev,
                            colour: parseInt(v.replace("#", ""), 16),
                          }))
                        }
                      />
                    </div>

                    <Textarea
                      label="Description"
                      value={embed.description || ""}
                      onChange={(v) => setEmbed((prev) => ({ ...prev, description: v }))}
                      max={EMBED_LIMITS.DESCRIPTION}
                    />

                    <Collapsible title="" subtitle="Author Settings" defaultOpen={false}>
                      <TextInput
                        label="Author Name"
                        placeholder="e.g. Support Team"
                        value={embed.author?.name || ""}
                        onChange={(v) =>
                          setEmbed((prev) => ({
                            ...prev,
                            author: { ...prev.author, name: v },
                          }))
                        }
                        maxLength={EMBED_LIMITS.AUTHOR_NAME}
                        showCount
                      />
                      <div className="pt-2 grid gap-2 grid-cols-1 md:grid-cols-2">
                        <TextInput
                          label="Author Icon URL"
                          placeholder="https://example.com/icon.png"
                          value={embed.author?.icon_url || ""}
                          onChange={(v) =>
                            setEmbed((prev) => ({
                              ...prev,
                              author: { ...prev.author, icon_url: v },
                            }))
                          }
                          maxLength={EMBED_LIMITS.URL}
                        />
                        <TextInput
                          label="Author URL"
                          placeholder="https://example.com"
                          value={embed.author?.url || ""}
                          onChange={(v) =>
                            setEmbed((prev) => ({
                              ...prev,
                              author: { ...prev.author, url: v },
                            }))
                          }
                          maxLength={EMBED_LIMITS.URL}
                        />
                      </div>
                    </Collapsible>

                    <Collapsible title="" subtitle="Images" defaultOpen={false}>
                      <TextInput
                        label="Thumbnail URL"
                        placeholder="https://example.com/thumbnail.png"
                        value={embed.thumbnail_url || ""}
                        onChange={(v) => setEmbed((prev) => ({ ...prev, thumbnail_url: v }))}
                        maxLength={EMBED_LIMITS.URL}
                      />
                      <TextInput
                        label="Image URL"
                        placeholder="https://example.com/image.png"
                        value={embed.image_url || ""}
                        onChange={(v) => setEmbed((prev) => ({ ...prev, image_url: v }))}
                        maxLength={EMBED_LIMITS.URL}
                      />
                    </Collapsible>

                    <Collapsible title="" subtitle="Footer Settings" defaultOpen={false}>
                      <Textarea
                        label="Footer Text"
                        placeholder={`e.g. ${BRANDING_FOOTER_TEXT}`}
                        value={embed.footer?.text || ""}
                        onChange={(v) =>
                          setEmbed((prev) => ({
                            ...prev,
                            footer: { ...prev.footer, text: v },
                          }))
                        }
                        max={EMBED_LIMITS.FOOTER_TEXT}
                      />
                      <TextInput
                        label="Footer Icon URL"
                        placeholder="https://example.com/footer-icon.png"
                        value={embed.footer?.icon_url || ""}
                        onChange={(v) =>
                          setEmbed((prev) => ({
                            ...prev,
                            footer: { ...prev.footer, icon_url: v },
                          }))
                        }
                        maxLength={EMBED_LIMITS.URL}
                      />
                      <DateTimePicker
                        label="Footer Timestamp (Optional)"
                        value={parseEmbedTimestamp(embed.timestamp)}
                        onChange={(date) =>
                          setEmbed((prev) => ({
                            ...prev,
                            timestamp: serializeEmbedTimestamp(date),
                          }))
                        }
                      />
                    </Collapsible>

                    <Collapsible title="" subtitle="Embed Fields" defaultOpen={false}>
                      <EmbedFieldsEditor
                        fields={embed.fields || []}
                        onChange={(fields) => setEmbed((prev) => ({ ...prev, fields }))}
                      />
                    </Collapsible>
                    <EmbedCharacterTotal embed={embed} />
                  </div>
                )}
              </>
            )}
          </div>

          {/* Right: Live Preview */}
          <div>
            <span className="text-xl font-semibold">Preview</span>
            {linkToKB && linkedArticle ? (
              <div className="mt-4">
                <p className="text-xs text-gray-300 mb-2">Showing linked KB article preview:</p>
                {linkedArticle.content && (
                  <p className="text-sm whitespace-pre-wrap bg-[#242429] rounded p-3 text-gray-200">
                    {linkedArticle.content}
                  </p>
                )}
                {!linkedArticle.content && (
                  <p className="text-gray-300 text-sm">
                    Article has no text content (may use an embed).
                  </p>
                )}
              </div>
            ) : (
              <>
                {content && (
                  <p className="mt-4 text-sm whitespace-pre-wrap bg-[#242429] rounded p-3">
                    {content}
                  </p>
                )}
                {useEmbed && <EmbedPreview embed={embed} />}
                {!content && !useEmbed && (
                  <p className="mt-4 text-gray-300 text-sm">
                    Add message content or enable an embed to see a preview.
                  </p>
                )}
              </>
            )}
          </div>
        </div>

        <div className="flex justify-end space-x-3 mt-6">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="success"
            onClick={handleSave}
            disabled={!isValid || !hasContent}
            // Native `disabled` already wins when the form itself is invalid; only
            // fall back to the visually-disabled/aria-disabled treatment when the
            // lock is the sole reason the button can't be pressed. Stacking both
            // on the same element would leave aria-disabled asserted on a control
            // that is also natively disabled, which is not what it's for.
            visuallyDisabled={locked && isValid && !!hasContent}
            aria-describedby={locked ? "tag-lock-banner" : undefined}
          >
            {isClone ? "Clone" : isEditing ? "Save" : "Create"}
          </Button>
        </div>
      </div>
    </ActionModal>
  );
};

export default TagEditorModal;
