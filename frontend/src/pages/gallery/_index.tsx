import { useEffect, useState, type FC } from "react";
import { useUrlSearch } from "@/hooks/useUrlSearch";
import { Link } from "react-router";
import { MainLayout } from "@/pages/layout/Main";
import { apiClient } from "@/lib/api";
import type { GalleryListing } from "@/types";
import Button from "@/components/Button";
import GalleryCard from "@/components/GalleryCard";
import GalleryImportModal from "@/components/modals/GalleryImportModal";
import GalleryImportTagModal from "@/components/modals/GalleryImportTagModal";
import GalleryImportFormModal from "@/components/modals/GalleryImportFormModal";
import CardGridSkeleton from "@/components/skeletons/CardGridSkeleton";
import Pagination from "@/components/Pagination";
import SearchInput from "@/components/SearchInput";
import Select from "@/components/Select";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSearch, faStar, faRectangleList, faXmark } from "@fortawesome/free-solid-svg-icons";

const CATEGORY_OPTIONS = [
  { key: "support", label: "Support" },
  { key: "moderation", label: "Moderation" },
  { key: "sales", label: "Sales" },
  { key: "application", label: "Applications" },
  { key: "feedback", label: "Feedback" },
  { key: "general", label: "General" },
  { key: "other", label: "Other" },
];

const TYPE_OPTIONS = [
  { key: "panel", label: "Panels" },
  { key: "tag", label: "Tags" },
  { key: "form", label: "Forms" },
];

const SORT_OPTIONS = [
  { key: "popular", label: "Popular" },
  { key: "newest", label: "Newest" },
];

const PAGE_SIZE = 20;

const GalleryBrowsePage: FC = () => {
  const [listings, setListings] = useState<GalleryListing[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const [category, setCategory] = useState<string>("all");
  const [listingType, setListingType] = useState<string>("all");
  const { searchQuery, setSearchQuery, debouncedSearch } = useUrlSearch();
  const [sort, setSort] = useState<string | null>("popular");
  const [page, setPage] = useState(1);

  const [importTarget, setImportTarget] = useState<GalleryListing | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  useEffect(() => {
    setLoading(true);
    apiClient.gallery
      .browse({
        category: category === "all" ? undefined : category,
        type: listingType === "all" ? undefined : listingType,
        search: debouncedSearch.trim() || undefined,
        sort: sort ?? undefined,
        page,
      })
      .then((res) => {
        setListings(res.data.listings ?? []);
        setTotal(res.data.total ?? 0);
      })
      .catch(() => {
        setListings([]);
        setTotal(0);
      })
      .finally(() => setLoading(false));
  }, [category, listingType, debouncedSearch, sort, page]);

  const clearFilters = () => {
    setCategory("all");
    setListingType("all");
    setSearchQuery("");
    setSort("popular");
    setPage(1);
  };

  const hasActiveFilters = category !== "all" || !!searchQuery.trim() || listingType !== "all";
  const featured = listings.filter((l) => l.featured);
  const nonFeatured = listings.filter((l) => !l.featured);

  return (
    <MainLayout
      title="Template Gallery"
      subtitle="Browse and import templates shared by the community"
    >
      {/* Filters */}
      <div className="flex flex-col sm:flex-row sm:items-end gap-3 mb-6">
        <div className="flex-1">
          <span className="mb-1 text-white block text-sm">Search</span>
          <SearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search templates..."
          />
        </div>
        <Select
          label="Category"
          value={category}
          onChange={(v) => {
            setCategory(v ?? "all");
            setPage(1);
          }}
          options={[{ key: "all", label: "All categories" }, ...CATEGORY_OPTIONS]}
          placeholder="All categories"
          hideSearch
          className="w-full sm:w-48"
        />
        <Select
          label="Type"
          value={listingType}
          onChange={(v) => {
            setListingType(v ?? "all");
            setPage(1);
          }}
          options={[{ key: "all", label: "All types" }, ...TYPE_OPTIONS]}
          placeholder="All types"
          hideSearch
          className="w-full sm:w-40"
        />
        <Select
          label="Sort by"
          value={sort}
          onChange={(v) => {
            setSort(v);
            setPage(1);
          }}
          options={SORT_OPTIONS}
          placeholder="Sort by"
          hideSearch
          className="w-full sm:w-40"
        />
        {hasActiveFilters && (
          <Button
            variant="ghost"
            onClick={clearFilters}
            title="Clear all filters"
            className="px-3 py-2 min-h-11 min-w-11 text-sm text-gray-400 hover:text-white"
          >
            <FontAwesomeIcon icon={faXmark} aria-hidden="true" />
            Clear
          </Button>
        )}
      </div>

      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {loading
          ? "Loading templates..."
          : listings.length === 0
            ? "No templates found."
            : `${total} template${total !== 1 ? "s" : ""} found. Showing page ${page} of ${totalPages}.`}
      </div>

      {loading ? (
        <CardGridSkeleton cards={6} />
      ) : listings.length === 0 ? (
        hasActiveFilters ? (
          /* No results state */
          <div className="text-center py-16">
            <FontAwesomeIcon
              icon={faSearch}
              className="text-gray-600 text-4xl mb-4"
              aria-hidden="true"
            />
            <p className="text-gray-400 text-lg mb-4">No templates found matching your filters.</p>
            <Button variant="primary" onClick={clearFilters}>
              Clear Filters
            </Button>
          </div>
        ) : (
          /* Empty state */
          <div className="text-center py-16">
            <FontAwesomeIcon
              icon={faRectangleList}
              className="text-gray-600 text-4xl mb-4"
              aria-hidden="true"
            />
            <p className="text-gray-400 text-lg mb-2">The gallery is just getting started.</p>
            <p className="text-gray-500 mb-6">
              Be one of the first to share your template with the community.
            </p>
            <Link to="/" className="text-blue-400 hover:text-blue-300 transition-colors">
              Go to your server to submit one
            </Link>
          </div>
        )
      ) : (
        <>
          {/* Featured section */}
          {featured.length > 0 && page === 1 && !hasActiveFilters && (
            <div className="mb-8">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <FontAwesomeIcon icon={faStar} className="text-yellow-400" aria-hidden="true" />
                Featured Templates
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {featured.map((listing) => (
                  <GalleryCard key={listing.id} listing={listing} onImport={setImportTarget} />
                ))}
              </div>
            </div>
          )}

          {/* Regular listings */}
          {nonFeatured.length > 0 && (
            <div>
              {featured.length > 0 && page === 1 && !hasActiveFilters && (
                <h2 className="text-lg font-semibold mb-4">All Templates</h2>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {(hasActiveFilters || page > 1 ? listings : nonFeatured).map((listing) => (
                  <GalleryCard key={listing.id} listing={listing} onImport={setImportTarget} />
                ))}
              </div>
            </div>
          )}

          <Pagination
            variant="full"
            page={page}
            totalPages={totalPages}
            onChange={setPage}
            disabled={loading}
          />
        </>
      )}

      {importTarget && importTarget.listing_type === "tag" ? (
        <GalleryImportTagModal listing={importTarget} open onClose={() => setImportTarget(null)} />
      ) : importTarget && importTarget.listing_type === "form" ? (
        <GalleryImportFormModal listing={importTarget} open onClose={() => setImportTarget(null)} />
      ) : importTarget ? (
        <GalleryImportModal listing={importTarget} open onClose={() => setImportTarget(null)} />
      ) : null}
    </MainLayout>
  );
};

export default GalleryBrowsePage;
