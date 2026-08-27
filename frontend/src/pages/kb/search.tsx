import { type FC, type JSX, useMemo } from "react";
import { useParams, Link } from "react-router";
import { Helmet } from "react-helmet-async";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSearch, faArrowLeft } from "@fortawesome/free-solid-svg-icons";
import Skeleton from "react-loading-skeleton";
import { useUrlSearch } from "@/hooks/useUrlSearch";
import {
  usePublicKBInfo,
  usePublicKBSearch,
  usePublicKBCategories,
} from "@/hooks/queries/usePublicKB";
import { articleExcerpt, formatRelativeTime } from "@/pages/kb/utils";
import type { KBArticle, KBCategory } from "@/types";

/**
 * Highlight matching text within a string by wrapping matches in <mark> tags.
 */
function highlightText(text: string, query: string): (string | JSX.Element)[] {
  if (!query.trim()) return [text];
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${escaped})`, "gi");
  const parts = text.split(regex);
  return parts.map((part, i) =>
    regex.test(part) ? (
      <mark key={i} className="bg-yellow-500/30 text-yellow-200 rounded px-0.5">
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

const SearchResultCard: FC<{
  article: KBArticle;
  guildId: string;
  categories: KBCategory[];
  query: string;
}> = ({ article, guildId, categories, query }) => {
  const articleCategories = categories.filter((c) => article.category_ids?.includes(c.id));
  const excerpt = articleExcerpt(article, 200);

  return (
    <Link
      to={`/kb/${guildId}/${article.slug}`}
      className="block bg-(--kb-card) rounded-lg p-5 border border-white/10 hover:border-white/25 transition-colors focus:outline-none focus:ring-2 focus:ring-(--kb-accent)"
    >
      <article>
        <h3 className="text-lg font-semibold text-(--kb-text) mb-2">
          {highlightText(article.title, query)}
        </h3>
        <p className="text-(--kb-text)/70 text-sm mb-3 line-clamp-3">
          {highlightText(excerpt, query)}
        </p>
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
  <div className="space-y-4" aria-live="polite" aria-label="Loading search results">
    {Array.from({ length: 3 }).map((_, i) => (
      <Skeleton key={i} height={120} borderRadius={8} />
    ))}
  </div>
);

const KBSearch: FC = () => {
  const { guildId } = useParams<{ guildId: string }>();
  const { searchQuery, setSearchQuery, debouncedSearch } = useUrlSearch();
  const { data: guildInfo } = usePublicKBInfo(guildId);
  const { data: categories } = usePublicKBCategories(guildId);
  const { data: results, isLoading, isFetching } = usePublicKBSearch(guildId, debouncedSearch);

  const guildName = guildInfo?.name ?? "Knowledge Base";

  const displayQuery = debouncedSearch || searchQuery.trim();
  const isLoadingResults = isLoading || isFetching;

  const publishedResults = useMemo(() => (results ?? []).filter((a) => a.published), [results]);

  return (
    <>
      <Helmet>
        <title>
          {displayQuery ? `Search: ${displayQuery}` : "Search"} - {guildName} Knowledge Base
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

        {/* Search input */}
        <div className="mb-8">
          <div className="relative max-w-lg">
            <FontAwesomeIcon
              icon={faSearch}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-(--kb-text)/50 pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search for articles..."
              aria-label="Search knowledge base articles"
              autoFocus
              className="w-full pl-12 pr-4 py-3 bg-(--kb-card) border border-white/15 rounded-xl text-(--kb-text) text-lg placeholder-(--kb-text)/40 focus:outline-none focus:ring-2 focus:ring-(--kb-accent) focus:border-transparent"
            />
          </div>
        </div>

        {/* Results */}
        <section aria-label="Search results" aria-live="polite">
          {!displayQuery ? (
            <div className="text-center py-12">
              <p className="text-(--kb-text)/70">Enter a search term to find articles.</p>
            </div>
          ) : isLoadingResults ? (
            <LoadingSkeleton />
          ) : publishedResults.length === 0 ? (
            <div className="bg-(--kb-card) rounded-lg p-8 text-center border border-white/10">
              <p className="text-(--kb-text) font-medium mb-2">
                No results found for &lsquo;{displayQuery}&rsquo;
              </p>
              <p className="text-(--kb-text)/70 text-sm">
                Try different keywords or browse categories.
              </p>
            </div>
          ) : (
            <>
              <p className="text-(--kb-text)/50 text-sm mb-4">
                {publishedResults.length} {publishedResults.length === 1 ? "result" : "results"} for
                &lsquo;
                {displayQuery}&rsquo;
              </p>
              <div className="space-y-4">
                {publishedResults.map((article) => (
                  <SearchResultCard
                    key={article.id}
                    article={article}
                    guildId={guildId!}
                    categories={categories ?? []}
                    query={displayQuery}
                  />
                ))}
              </div>
            </>
          )}
        </section>
      </div>
    </>
  );
};

export default KBSearch;
