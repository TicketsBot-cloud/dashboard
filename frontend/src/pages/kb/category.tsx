import { type FC, useMemo } from "react";
import { useParams, Link } from "react-router";
import { Helmet } from "react-helmet-async";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft } from "@fortawesome/free-solid-svg-icons";
import Skeleton from "react-loading-skeleton";
import {
  usePublicKBInfo,
  usePublicKBArticles,
  usePublicKBCategories,
} from "@/hooks/queries/usePublicKB";
import { articleExcerpt, formatRelativeTime } from "@/pages/kb/utils";
import type { KBArticle, KBCategory as KBCategoryType } from "@/types";

const ArticleCard: FC<{
  article: KBArticle;
  guildId: string;
  categories: KBCategoryType[];
}> = ({ article, guildId, categories }) => {
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

const LoadingSkeleton: FC = () => (
  <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
    <Skeleton width={200} height={16} className="mb-6" />
    <Skeleton width={250} height={32} className="mb-6" />
    <div className="space-y-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} height={100} borderRadius={8} />
      ))}
    </div>
  </div>
);

const KBCategoryPage: FC = () => {
  const { guildId, catId } = useParams<{ guildId: string; catId: string }>();
  const { data: guildInfo } = usePublicKBInfo(guildId);
  const { data: articles, isLoading: articlesLoading } = usePublicKBArticles(guildId);
  const { data: categories, isLoading: categoriesLoading } = usePublicKBCategories(guildId);

  const isLoading = articlesLoading || categoriesLoading;
  const guildName = guildInfo?.name ?? "Knowledge Base";

  const category = useMemo(
    () => categories?.find((c) => String(c.id) === catId),
    [categories, catId],
  );

  const filteredArticles = useMemo(
    () =>
      (articles ?? []).filter((a) => a.published && (a.category_ids ?? []).includes(Number(catId))),
    [articles, catId],
  );

  if (isLoading) {
    return (
      <>
        <Helmet>
          <title>Category - {guildName} Knowledge Base</title>
        </Helmet>
        <div aria-live="polite" aria-label="Loading category">
          <LoadingSkeleton />
        </div>
      </>
    );
  }

  const categoryName = category?.name ?? "Category";

  return (
    <>
      <Helmet>
        <title>
          {categoryName} - {guildName} Knowledge Base
        </title>
      </Helmet>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        {/* Back link */}
        <Link
          to={`/kb/${guildId}`}
          className="inline-flex items-center gap-2 text-(--kb-text)/50 hover:text-(--kb-text)/80 transition-colors mb-6"
        >
          <FontAwesomeIcon icon={faArrowLeft} aria-hidden="true" />
          Back to Knowledge Base
        </Link>

        {/* Category heading */}
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-(--kb-text) flex items-center gap-3">
            {category?.emoji && (
              <span className="text-3xl" aria-hidden="true">
                {category.emoji}
              </span>
            )}
            {categoryName}
          </h1>
        </header>

        {/* Articles */}
        <section aria-label={`Articles in ${categoryName}`}>
          {filteredArticles.length === 0 ? (
            <div className="bg-(--kb-card) rounded-lg p-8 text-center border border-white/10">
              <p className="text-(--kb-text)/70">No articles in this category yet.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredArticles.map((article) => (
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

export default KBCategoryPage;
