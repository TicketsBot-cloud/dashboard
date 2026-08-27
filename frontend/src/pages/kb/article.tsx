import { type FC, type ReactNode, useState, useCallback, useEffect, useMemo } from "react";
import { useParams, Link } from "react-router";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Helmet } from "react-helmet-async";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faCheckCircle } from "@fortawesome/free-solid-svg-icons";
import Skeleton from "react-loading-skeleton";
import Button from "@/components/Button";
import EmbedPreview from "@/components/EmbedPreview";
import {
  usePublicKBInfo,
  usePublicKBArticle,
  usePublicKBArticles,
  usePublicKBCategories,
  useSubmitKBFeedback,
} from "@/hooks/queries/usePublicKB";
import { useKBVotesStore, selectKBVote, type KBFeedbackVote } from "@/stores/kbVotes";
import { articleExcerpt, formatDate } from "@/pages/kb/utils";
import type { KBArticle } from "@/types";

const ArticleNotFound: FC<{ guildId: string }> = ({ guildId }) => {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 text-center" role="alert">
      <h1 className="text-2xl font-bold text-(--kb-text) mb-2">Article not found</h1>
      <p className="text-(--kb-text)/70 mb-6">
        The article you are looking for does not exist or has been removed.
      </p>
      <Link
        to={`/kb/${guildId}`}
        className="inline-flex items-center gap-2 text-(--kb-accent) hover:text-(--kb-accent)/80 transition-colors"
      >
        <FontAwesomeIcon icon={faArrowLeft} aria-hidden="true" />
        Back to Knowledge Base
      </Link>
    </div>
  );
};

const RelatedArticleCard: FC<{ article: KBArticle; guildId: string }> = ({ article, guildId }) => {
  return (
    <Link
      to={`/kb/${guildId}/${article.slug}`}
      className="block bg-(--kb-card) rounded-lg p-4 border border-white/10 hover:border-white/25 transition-colors focus:outline-none focus:ring-2 focus:ring-(--kb-accent)"
    >
      <h4 className="text-(--kb-text) font-medium mb-1">{article.title}</h4>
      <p className="text-(--kb-text)/70 text-sm line-clamp-2">{articleExcerpt(article, 100)}</p>
    </Link>
  );
};

const LoadingSkeleton: FC = () => (
  <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
    <Skeleton width={200} height={16} className="mb-6" />
    <Skeleton width="70%" height={36} className="mb-4" />
    <Skeleton count={8} className="mb-2" />
    <div className="mt-8 flex gap-2">
      <Skeleton width={80} height={28} borderRadius={14} />
      <Skeleton width={100} height={28} borderRadius={14} />
    </div>
  </div>
);

const KBArticlePage: FC = () => {
  const { guildId, slug } = useParams<{ guildId: string; slug: string }>();
  const { data: guildInfo } = usePublicKBInfo(guildId);
  const { data: article, isLoading, isError } = usePublicKBArticle(guildId, slug);
  const { data: allArticles } = usePublicKBArticles(guildId);
  const { data: categories } = usePublicKBCategories(guildId);
  const [copied, setCopied] = useState(false);
  const recordedVote = useKBVotesStore(selectKBVote(guildId, slug));
  const setVote = useKBVotesStore((s) => s.setVote);
  const [pendingVote, setPendingVote] = useState<KBFeedbackVote | null>(null);
  const [voteFailed, setVoteFailed] = useState(false);
  const submitFeedback = useSubmitKBFeedback(guildId);
  const feedbackVote = recordedVote ?? pendingVote;

  useEffect(() => {
    setPendingVote(null);
    setVoteFailed(false);
  }, [guildId, slug]);

  const handleVote = useCallback(
    async (vote: KBFeedbackVote) => {
      if (!guildId || !slug || feedbackVote !== null || submitFeedback.isPending) return;

      setPendingVote(vote);
      setVoteFailed(false);
      try {
        await submitFeedback.mutateAsync({ slug, helpful: vote === "yes" });
        try {
          setVote(guildId, slug, vote);
        } catch {
          // The vote is recorded server-side regardless.
        }
      } catch {
        setPendingVote(null);
        setVoteFailed(true);
      }
    },
    [guildId, slug, feedbackVote, submitFeedback, setVote],
  );

  const guildName = guildInfo?.name ?? "Knowledge Base";

  const articleCategories = useMemo(
    () => (categories ?? []).filter((c) => article?.category_ids?.includes(c.id)),
    [categories, article],
  );

  const relatedArticles = useMemo(() => {
    if (!article || !allArticles) return [];
    const categorySet = new Set(article.category_ids ?? []);
    return allArticles
      .filter(
        (a) =>
          a.id !== article.id &&
          a.published &&
          (a.category_ids ?? []).some((cid) => categorySet.has(cid)),
      )
      .slice(0, 3);
  }, [article, allArticles]);

  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API may be unavailable
    }
  }, []);

  if (isLoading) {
    return (
      <>
        <Helmet>
          <title>Loading... - {guildName} Knowledge Base</title>
        </Helmet>
        <div aria-live="polite" aria-label="Loading article">
          <LoadingSkeleton />
        </div>
      </>
    );
  }

  if (isError || !article) {
    return (
      <>
        <Helmet>
          <title>Article not found - {guildName} Knowledge Base</title>
        </Helmet>
        <ArticleNotFound guildId={guildId!} />
      </>
    );
  }

  const metaDescription = articleExcerpt(article, 160) || article.title;

  // Hidden at zero so a new article does not advertise that nobody found it useful.
  const helpfulCount =
    article.helpful_count !== undefined && article.helpful_count > 0 ? article.helpful_count : null;

  return (
    <>
      <Helmet>
        <title>
          {article.title} - {guildName} Knowledge Base
        </title>
        <meta name="description" content={metaDescription} />
      </Helmet>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        {/* Breadcrumbs */}
        <nav aria-label="Breadcrumb" className="mb-6">
          <ol className="flex flex-wrap items-center gap-2 text-sm text-(--kb-text)/50">
            <li>
              <Link to={`/kb/${guildId}`} className="hover:text-(--kb-text)/80 transition-colors">
                {guildName} KB
              </Link>
            </li>
            {articleCategories.length > 0 && (
              <>
                <li aria-hidden="true">/</li>
                <li>
                  <Link
                    to={`/kb/${guildId}/category/${articleCategories[0].id}`}
                    className="hover:text-(--kb-text)/80 transition-colors"
                  >
                    {articleCategories[0].name}
                  </Link>
                </li>
              </>
            )}
            <li aria-hidden="true">/</li>
            <li className="text-(--kb-text)/70" aria-current="page">
              {article.title}
            </li>
          </ol>
        </nav>

        {/* Article */}
        <article>
          <h1 className="text-3xl font-bold text-(--kb-text) mb-6">{article.title}</h1>

          {/* Content */}
          {article.content && (
            <div className="max-w-none mb-6">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  h1: ({ children }: { children?: ReactNode }) => (
                    <h1 className="text-2xl font-bold text-(--kb-text) mt-6 mb-3">{children}</h1>
                  ),
                  h2: ({ children }: { children?: ReactNode }) => (
                    <h2 className="text-xl font-bold text-(--kb-text) mt-5 mb-2">{children}</h2>
                  ),
                  h3: ({ children }: { children?: ReactNode }) => (
                    <h3 className="text-lg font-bold text-(--kb-text) mt-4 mb-2">{children}</h3>
                  ),
                  p: ({ children }: { children?: ReactNode }) => (
                    <p className="text-(--kb-text)/90 mb-3 leading-relaxed">{children}</p>
                  ),
                  a: ({ href, children }: { href?: string; children?: ReactNode }) => (
                    <a
                      href={href}
                      className="text-(--kb-accent) hover:text-(--kb-accent)/80 underline"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {children}
                    </a>
                  ),
                  ul: ({ children }: { children?: ReactNode }) => (
                    <ul className="list-disc pl-6 mb-3 text-(--kb-text)/90">{children}</ul>
                  ),
                  ol: ({ children }: { children?: ReactNode }) => (
                    <ol className="list-decimal pl-6 mb-3 text-(--kb-text)/90">{children}</ol>
                  ),
                  li: ({ children }: { children?: ReactNode }) => (
                    <li className="mb-1">{children}</li>
                  ),
                  blockquote: ({ children }: { children?: ReactNode }) => (
                    <blockquote className="border-l-3 border-white/15 pl-4 text-(--kb-text)/70 italic my-3">
                      {children}
                    </blockquote>
                  ),
                  code: ({ className, children }: { className?: string; children?: ReactNode }) => {
                    const isBlock = className?.includes("language-");
                    return isBlock ? (
                      <pre className="bg-black/20 rounded-lg p-4 overflow-x-auto my-3">
                        <code className="text-(--kb-text)/90 text-sm">{children}</code>
                      </pre>
                    ) : (
                      <code className="bg-black/20 px-1.5 py-0.5 rounded text-sm text-(--kb-text)/90">
                        {children}
                      </code>
                    );
                  },
                  hr: () => <hr className="border-white/10 my-6" />,
                }}
              >
                {article.content ?? ""}
              </ReactMarkdown>
            </div>
          )}
          {article.embed && (
            <div className="mb-6">
              <EmbedPreview embed={article.embed} />
            </div>
          )}

          {/* Keywords */}
          {article.keywords && article.keywords.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-6" aria-label="Keywords">
              {article.keywords.map((keyword) => (
                <span
                  key={keyword}
                  className="text-xs bg-white/5 text-(--kb-text)/70 px-3 py-1 rounded-full"
                >
                  {keyword}
                </span>
              ))}
            </div>
          )}

          {/* Category badges */}
          {articleCategories.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-6" aria-label="Categories">
              {articleCategories.map((cat) => (
                <Link
                  key={cat.id}
                  to={`/kb/${guildId}/category/${cat.id}`}
                  className="inline-flex items-center gap-1 text-xs bg-(--kb-accent)/15 text-(--kb-accent) px-3 py-1 rounded-full hover:bg-(--kb-accent)/25 transition-colors"
                >
                  {cat.emoji && <span aria-hidden="true">{cat.emoji}</span>}
                  {cat.name}
                </Link>
              ))}
            </div>
          )}

          {/* Last updated */}
          <p className="text-sm text-(--kb-text)/50 mb-8">
            Last updated: {formatDate(article.updated_at)}
          </p>
        </article>

        {/* Was this helpful */}
        <section
          className="bg-(--kb-card) rounded-lg p-6 border border-white/10 mb-8"
          aria-label="Article feedback"
        >
          <p className="text-(--kb-text)/70 font-medium mb-3">Was this article helpful?</p>
          <div className="flex items-center gap-3">
            <Button
              variant={feedbackVote === "yes" ? "success" : "ghost"}
              onClick={() => handleVote("yes")}
              disabled={feedbackVote !== null || submitFeedback.isPending}
              className={`rounded-lg text-sm font-medium focus:ring-2 focus:ring-(--kb-accent) ${
                feedbackVote !== "yes" ? "bg-white/5 text-(--kb-text)/70 hover:bg-white/10" : ""
              }`}
            >
              Yes
            </Button>
            <Button
              variant={feedbackVote === "no" ? "danger" : "ghost"}
              onClick={() => handleVote("no")}
              disabled={feedbackVote !== null || submitFeedback.isPending}
              className={`rounded-lg text-sm font-medium focus:ring-2 focus:ring-(--kb-accent) ${
                feedbackVote !== "no" ? "bg-white/5 text-(--kb-text)/70 hover:bg-white/10" : ""
              }`}
            >
              No
            </Button>

            <Button
              variant="ghost"
              onClick={handleCopyLink}
              className="ml-auto rounded-lg text-sm font-medium bg-white/5 text-(--kb-text)/70 hover:bg-white/10 focus:ring-2 focus:ring-(--kb-accent)"
              title="Copy link to this article"
            >
              {copied ? (
                <span className="inline-flex items-center gap-1">
                  <FontAwesomeIcon icon={faCheckCircle} aria-hidden="true" />
                  Copied!
                </span>
              ) : (
                "Share"
              )}
            </Button>
          </div>
          {helpfulCount !== null && (
            <p className="text-(--kb-text)/50 text-sm mt-3">
              {helpfulCount === 1
                ? "1 person found this helpful"
                : `${helpfulCount} people found this helpful`}
            </p>
          )}
          {feedbackVote && (
            <p className="text-(--kb-text)/50 text-sm mt-3" aria-live="polite">
              Thank you for your feedback!
            </p>
          )}
          {voteFailed && (
            <p className="text-red-400 text-sm mt-3" aria-live="polite">
              Could not record your feedback. Please try again in a moment.
            </p>
          )}
        </section>

        {/* Related articles */}
        {relatedArticles.length > 0 && (
          <section aria-label="Related articles">
            <h2 className="text-xl font-semibold text-(--kb-text) mb-4">Related Articles</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {relatedArticles.map((related) => (
                <RelatedArticleCard key={related.id} article={related} guildId={guildId!} />
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  );
};

export default KBArticlePage;
