import { type FC, type FormEvent, useState, useCallback, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router";
import { Helmet } from "react-helmet-async";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSearch } from "@fortawesome/free-solid-svg-icons";
import Skeleton from "react-loading-skeleton";
import {
  usePublicKBInfo,
  usePublicKBArticles,
  usePublicKBCategories,
} from "@/hooks/queries/usePublicKB";
import { articleExcerpt, formatRelativeTime } from "@/pages/kb/utils";
import type { KBArticle, KBCategory } from "@/types";

const ArticleCard: FC<{ article: KBArticle; guildId: string; categories: KBCategory[] }> = ({
  article,
  guildId,
  categories,
}) => {
  const articleCategories = categories.filter((c) => article.category_ids?.includes(c.id));
  const excerpt = articleExcerpt(article, 150) || "No content available";

  return (
    <Link
      to={`/kb/${guildId}/${article.slug}`}
      className="block bg-(--kb-card) rounded-lg p-5 border border-white/10 hover:border-white/25 transition-colors focus:outline-none focus:ring-2 focus:ring-(--kb-accent)"
    >
      <article>
        <h3 className="text-lg font-semibold text-(--kb-text) mb-2">{article.title}</h3>
        <p className="text-(--kb-text)/70 text-sm mb-3 line-clamp-2">{excerpt}</p>
        <div className="flex flex-wrap items-center gap-2">
          {articleCategories.map((cat) => (
            <span
              key={cat.id}
              className="inline-flex items-center gap-1 text-xs bg-white/5 text-(--kb-text)/70 px-2 py-1 rounded-full"
            >
              {cat.emoji && <span aria-hidden="true">{cat.emoji}</span>}
              {cat.name}
            </span>
          ))}
          <span className="text-xs text-(--kb-text)/50 ml-auto">
            Updated {formatRelativeTime(article.updated_at)}
          </span>
        </div>
      </article>
    </Link>
  );
};

const CategoryCard: FC<{ category: KBCategory; guildId: string; articleCount: number }> = ({
  category,
  guildId,
  articleCount,
}) => {
  return (
    <Link
      to={`/kb/${guildId}/category/${category.id}`}
      className="block bg-(--kb-card) rounded-lg p-5 border border-white/10 hover:border-white/25 transition-colors text-center focus:outline-none focus:ring-2 focus:ring-(--kb-accent)"
    >
      {category.emoji && (
        <div className="text-3xl mb-2" aria-hidden="true">
          {category.emoji}
        </div>
      )}
      <h3 className="text-(--kb-text) font-semibold mb-1">{category.name}</h3>
      <p className="text-(--kb-text)/50 text-sm">
        {articleCount} {articleCount === 1 ? "article" : "articles"}
      </p>
    </Link>
  );
};

const LoadingSkeleton: FC = () => (
  <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
    <div className="mb-10 text-center">
      <Skeleton width={300} height={32} className="mb-4" />
      <Skeleton width="100%" height={48} className="max-w-120" />
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} height={120} borderRadius={8} />
      ))}
    </div>
    <div className="space-y-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} height={100} borderRadius={8} />
      ))}
    </div>
  </div>
);

const KBHome: FC = () => {
  const { guildId } = useParams<{ guildId: string }>();
  const navigate = useNavigate();
  const { data: guildInfo } = usePublicKBInfo(guildId);
  const { data: articles, isLoading: articlesLoading } = usePublicKBArticles(guildId);
  const { data: categories, isLoading: categoriesLoading } = usePublicKBCategories(guildId);
  const [heroSearch, setHeroSearch] = useState("");

  const isLoading = articlesLoading || categoriesLoading;

  const publishedArticles = useMemo(() => (articles ?? []).filter((a) => a.published), [articles]);

  const categoryArticleCounts = useMemo(() => {
    const counts: Record<number, number> = {};
    for (const article of publishedArticles) {
      for (const catId of article.category_ids ?? []) {
        counts[catId] = (counts[catId] || 0) + 1;
      }
    }
    return counts;
  }, [publishedArticles]);

  const handleHeroSearch = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      const trimmed = heroSearch.trim();
      if (trimmed && guildId) {
        navigate(`/kb/${guildId}/search?q=${encodeURIComponent(trimmed)}`);
      }
    },
    [heroSearch, guildId, navigate],
  );

  if (isLoading) {
    return (
      <>
        <Helmet>
          <title>Knowledge Base</title>
        </Helmet>
        <div aria-live="polite" aria-label="Loading knowledge base">
          <LoadingSkeleton />
        </div>
      </>
    );
  }

  const hasCategories = categories && categories.length > 0;
  const guildName = guildInfo?.name ?? "Knowledge Base";

  return (
    <>
      <Helmet>
        <title>{guildName} - Knowledge Base</title>
        <meta name="description" content={`Browse help articles and guides from ${guildName}.`} />
      </Helmet>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        {/* Hero section */}
        <section className="mb-10 text-center" aria-label="Search">
          <h1 className="text-3xl font-bold text-(--kb-text) mb-2">{guildName} Knowledge Base</h1>
          <p className="text-(--kb-text)/70 mb-6">Find answers and guides for your questions.</p>

          <form
            onSubmit={handleHeroSearch}
            role="search"
            aria-label="Search articles"
            className="max-w-lg mx-auto"
          >
            <div className="relative">
              <FontAwesomeIcon
                icon={faSearch}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-(--kb-text)/50 pointer-events-none"
                aria-hidden="true"
              />
              <input
                type="search"
                value={heroSearch}
                onChange={(e) => setHeroSearch(e.target.value)}
                placeholder="Search for articles..."
                aria-label="Search knowledge base articles"
                className="w-full pl-12 pr-4 py-3 bg-(--kb-card) border border-white/15 rounded-xl text-(--kb-text) text-lg placeholder-(--kb-text)/40 focus:outline-none focus:ring-2 focus:ring-(--kb-accent) focus:border-transparent"
              />
            </div>
          </form>
        </section>

        {/* Categories */}
        {hasCategories && (
          <section className="mb-10" aria-label="Categories">
            <h2 className="text-xl font-semibold text-(--kb-text) mb-4">Categories</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {categories.map((cat) => (
                <CategoryCard
                  key={cat.id}
                  category={cat}
                  guildId={guildId!}
                  articleCount={categoryArticleCounts[cat.id] ?? 0}
                />
              ))}
            </div>
          </section>
        )}

        {/* All articles */}
        <section aria-label="All articles">
          <h2 className="text-xl font-semibold text-(--kb-text) mb-4">All Articles</h2>
          {publishedArticles.length === 0 ? (
            <div className="bg-(--kb-card) rounded-lg p-8 text-center border border-white/10">
              <p className="text-(--kb-text)/70">No articles published yet.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {publishedArticles.map((article) => (
                <ArticleCard
                  key={article.id}
                  article={article}
                  guildId={guildId!}
                  categories={categories ?? []}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
};

export default KBHome;
