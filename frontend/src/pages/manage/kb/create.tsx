import { useState, type FC } from "react";
import { useParams, useNavigate } from "react-router";
import { toast } from "sonner";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft } from "@fortawesome/free-solid-svg-icons";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { MainLayout } from "@/pages/layout/Main";
import Button from "@/components/Button";
import TextInput from "@/components/TextInput";
import Textarea from "@/components/Textarea";
import MarkdownEditor from "@/components/MarkdownEditor";
import MultiSelect from "@/components/MultiSelect";
import KeywordInput from "@/components/KeywordInput";
import Slider from "@/components/Slider";
import ColourSelect from "@/components/ColourSelect";
import Collapsible from "@/components/Collapsible";
import EmbedFieldsEditor from "@/components/EmbedFieldsEditor";
import EmbedPreview from "@/components/EmbedPreview";
import { useKBCategories, useCreateKBArticle } from "@/hooks/queries/useKB";
import type { TagEmbed } from "@/types";

const defaultEmbed: TagEmbed = {
  colour: 0x5865f2,
  author: {},
  footer: {},
  fields: [],
};

const CreateKBArticlePage: FC = () => {
  let { guildId } = useParams();
  guildId = guildId!;

  const navigate = useNavigate();
  const { data: categories } = useKBCategories(guildId);
  const createArticle = useCreateKBArticle(guildId);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [content, setContent] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [keywordsInput, setKeywordsInput] = useState("");
  const [keywords, setKeywords] = useState<string[]>([]);
  const [useEmbed, setUseEmbed] = useState(false);
  const [embed, setEmbed] = useState<TagEmbed>({
    ...defaultEmbed,
    author: {},
    footer: {},
    fields: [],
  });
  const [published, setPublished] = useState(false);
  const [showHelpfulCount, setShowHelpfulCount] = useState(false);

  const handleAddKeyword = (input: string) => {
    const parts = input
      .split(",")
      .map((k) => k.trim().toLowerCase())
      .filter((k) => k.length > 0 && !keywords.includes(k));

    if (parts.length > 0) {
      setKeywords((prev) => [...prev, ...parts]);
    }
    setKeywordsInput("");
  };

  const handleKeywordsKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      handleAddKeyword(keywordsInput);
    }
    if (e.key === "Backspace" && keywordsInput === "" && keywords.length > 0) {
      setKeywords((prev) => prev.slice(0, -1));
    }
  };

  const removeKeyword = (kw: string) => {
    setKeywords((prev) => prev.filter((k) => k !== kw));
  };

  const handleSubmit = async () => {
    if (!title.trim()) return;

    const embedData = useEmbed
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
          footer: {
            text: embed.footer?.text || undefined,
            icon_url: embed.footer?.icon_url || undefined,
          },
        }
      : null;

    try {
      await createArticle.mutateAsync({
        title: title.trim(),
        description: description.trim() || null,
        content: content || null,
        embed: embedData,
        category_ids: selectedCategories.map(Number),
        keywords,
        published,
        show_helpful_count: showHelpfulCount,
      });
      toast.success("Article created");
      navigate(`/manage/${guildId}/kb`);
    } catch {
      // Error handled by API interceptor
    }
  };

  const categoryOptions = (categories ?? []).map((cat) => ({
    key: String(cat.id),
    label: cat.emoji ? `${cat.emoji} ${cat.name}` : cat.name,
  }));

  const isValid = title.trim().length > 0;

  const markdownComponents = {
    h1: ({ children }: { children?: React.ReactNode }) => (
      <h1 className="text-2xl font-bold text-white mt-6 mb-3">{children}</h1>
    ),
    h2: ({ children }: { children?: React.ReactNode }) => (
      <h2 className="text-xl font-bold text-white mt-5 mb-2">{children}</h2>
    ),
    h3: ({ children }: { children?: React.ReactNode }) => (
      <h3 className="text-lg font-bold text-white mt-4 mb-2">{children}</h3>
    ),
    p: ({ children }: { children?: React.ReactNode }) => (
      <p className="text-gray-200 mb-3 leading-relaxed">{children}</p>
    ),
    a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
      <a
        href={href}
        className="text-blue-400 hover:text-blue-300 underline"
        target="_blank"
        rel="noopener noreferrer"
      >
        {children}
      </a>
    ),
    ul: ({ children }: { children?: React.ReactNode }) => (
      <ul className="list-disc pl-6 mb-3 text-gray-200">{children}</ul>
    ),
    ol: ({ children }: { children?: React.ReactNode }) => (
      <ol className="list-decimal pl-6 mb-3 text-gray-200">{children}</ol>
    ),
    li: ({ children }: { children?: React.ReactNode }) => <li className="mb-1">{children}</li>,
    blockquote: ({ children }: { children?: React.ReactNode }) => (
      <blockquote className="border-l-3 border-gray-600 pl-4 text-gray-300 italic my-3">
        {children}
      </blockquote>
    ),
    code: ({ className, children }: { className?: string; children?: React.ReactNode }) => {
      const isBlock = className?.includes("language-");
      return isBlock ? (
        <pre className="bg-gray-900 rounded-lg p-4 overflow-x-auto my-3">
          <code className="text-gray-200 text-sm">{children}</code>
        </pre>
      ) : (
        <code className="bg-gray-900 px-1.5 py-0.5 rounded text-sm text-gray-200">{children}</code>
      );
    },
    hr: () => <hr className="border-gray-700 my-6" />,
  };

  return (
    <MainLayout title="Create Article" subtitle="Add a new article to your knowledge base">
      <div className="space-y-6">
        <Button
          variant="ghost"
          type="button"
          onClick={() => navigate(`/manage/${guildId}/kb`)}
          className="items-center justify-start text-gray-300 hover:text-white text-sm p-0"
        >
          <FontAwesomeIcon icon={faArrowLeft} className="mr-2" aria-hidden="true" />
          Back to Knowledge Base
        </Button>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Form */}
          <section className="space-y-4" aria-label="Article details">
            <TextInput
              label="Title"
              placeholder="e.g. How to create a ticket"
              value={title}
              onChange={setTitle}
              maxLength={100}
            />

            <Textarea
              label="Description"
              placeholder="A short summary shown in Discord browse and search results"
              value={description}
              onChange={setDescription}
              max={255}
            />

            <MarkdownEditor
              label="Content"
              value={content}
              onChange={setContent}
              placeholder="Write the article content here..."
              maxLength={4096}
            />

            <MultiSelect
              label="Categories"
              value={selectedCategories}
              options={categoryOptions}
              onChange={setSelectedCategories}
              placeholder="Select categories..."
            />

            <KeywordInput
              label="Keywords"
              keywords={keywords}
              value={keywordsInput}
              onChange={setKeywordsInput}
              onKeyDown={handleKeywordsKeyDown}
              onBlur={() => {
                if (keywordsInput.trim()) handleAddKeyword(keywordsInput);
              }}
              onRemove={removeKeyword}
            />

            <Slider label="Published" value={published} onChange={setPublished} />

            <Slider
              label="Show helpful count publicly"
              value={showHelpfulCount}
              onChange={setShowHelpfulCount}
            />

            <Slider label="Use Embed" value={useEmbed} onChange={setUseEmbed} />

            {useEmbed && (
              <div className="space-y-3">
                <div className="grid gap-2 grid-cols-1 md:grid-cols-2">
                  <TextInput
                    label="Embed Title"
                    placeholder="Embed title"
                    value={embed.title || ""}
                    onChange={(v) => setEmbed((prev) => ({ ...prev, title: v }))}
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
                  label="Embed Description"
                  value={embed.description || ""}
                  onChange={(v) => setEmbed((prev) => ({ ...prev, description: v }))}
                  max={4096}
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
                    />
                  </div>
                </Collapsible>

                <Collapsible title="" subtitle="Images" defaultOpen={false}>
                  <TextInput
                    label="Thumbnail URL"
                    placeholder="https://example.com/thumbnail.png"
                    value={embed.thumbnail_url || ""}
                    onChange={(v) => setEmbed((prev) => ({ ...prev, thumbnail_url: v }))}
                  />
                  <TextInput
                    label="Image URL"
                    placeholder="https://example.com/image.png"
                    value={embed.image_url || ""}
                    onChange={(v) => setEmbed((prev) => ({ ...prev, image_url: v }))}
                  />
                </Collapsible>

                <Collapsible title="" subtitle="Footer Settings" defaultOpen={false}>
                  <TextInput
                    label="Footer Text"
                    placeholder="e.g. Powered by Tickets.bot"
                    value={embed.footer?.text || ""}
                    onChange={(v) =>
                      setEmbed((prev) => ({
                        ...prev,
                        footer: { ...prev.footer, text: v },
                      }))
                    }
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
                  />
                </Collapsible>

                <Collapsible title="" subtitle="Embed Fields" defaultOpen={false}>
                  <EmbedFieldsEditor
                    fields={embed.fields || []}
                    onChange={(fields) => setEmbed((prev) => ({ ...prev, fields }))}
                  />
                </Collapsible>
              </div>
            )}

            <div className="flex justify-end pt-4">
              <Button
                variant="success"
                onClick={handleSubmit}
                disabled={!isValid || createArticle.isPending}
                className="font-medium"
              >
                {createArticle.isPending ? "Creating..." : "Create Article"}
              </Button>
            </div>
          </section>

          {/* Right: Preview */}
          <section aria-label="Article preview">
            <h2 className="text-xl font-semibold mb-4">Preview</h2>
            {content && (
              <div className="mt-2 text-sm bg-[#242429] rounded p-3 text-gray-300">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                  {content}
                </ReactMarkdown>
              </div>
            )}
            {useEmbed && <EmbedPreview embed={embed} />}
            {!content && !useEmbed && (
              <p className="mt-4 text-gray-400 text-sm">
                Add content or enable an embed to see a preview.
              </p>
            )}
          </section>
        </div>
      </div>
    </MainLayout>
  );
};

export default CreateKBArticlePage;
