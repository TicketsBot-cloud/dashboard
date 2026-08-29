import { useEffect, useState, useMemo, type FC } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBook,
  faEdit,
  faPlus,
  faTrash,
  faExternalLinkAlt,
  faTimes,
  faLock,
  faArrowUp,
  faArrowDown,
  faCheck,
} from "@fortawesome/free-solid-svg-icons";

import EmptyState from "@/components/EmptyState";
import Pagination from "@/components/Pagination";
import { MainLayout } from "@/pages/layout/Main";
import { useGuildStore } from "@/stores/guild";
import { getGuildById } from "@/stores/auth";
import Checkbox from "@/components/Checkbox";
import ConfirmModal from "@/components/modals/ConfirmModal";
import Button from "@/components/Button";
import RadioGroup from "@/components/RadioGroup";
import TextInput from "@/components/TextInput";
import Collapsible from "@/components/Collapsible";
import ColourSelect from "@/components/ColourSelect";
import EmojiPicker from "@/components/EmojiPicker";
import Slider from "@/components/Slider";
import TableSkeleton from "@/components/skeletons/TableSkeleton";
import {
  useKBArticles,
  useKBCategories,
  useCreateKBCategory,
  useUpdateKBCategory,
  useDeleteKBCategory,
  useDeleteKBArticle,
  useReorderKBArticles,
  useKBSettings,
  useUpdateKBSettings,
} from "@/hooks/queries/useKB";
import { apiClient } from "@/lib/api";
import type { KBArticle, KBCategory, PremiumState } from "@/types";
import { SortTrigger, ariaSortFor } from "@/components/SortableHeaderCell";
import { useTableSort } from "@/hooks/useTableSort";
import type { SortColumn } from "@/lib/table-sort";
import { KB_DOMAIN } from "@/lib/constants";
import { usePreferencesStore } from "@/stores/preferences";
import ActionDropdown from "@/components/ActionDropdown";
import ColumnSelectorButton from "@/components/ColumnSelectorButton";
import Table from "@/components/Table";
import ColumnFilter from "@/components/ColumnFilter";

const ARTICLES_PER_PAGE = 20;

const DEFAULT_PRIMARY_BG = "#111827";
const DEFAULT_CARD_BG = "#1F2937";
const DEFAULT_TEXT_COLOUR = "#FFFFFF";
const DEFAULT_ACCENT_COLOUR = "#3B82F6";

const intToHex = (val: number | string | null | undefined, fallback: string): string => {
  if (val === null || val === undefined) return fallback;
  if (typeof val === "string") return val.startsWith("#") ? val : `#${val}`;
  return `#${val.toString(16).padStart(6, "0").toUpperCase()}`;
};

// WCAG contrast ratio calculation
function relativeLuminance(hex: string): number {
  const rgb = parseInt(hex.replace("#", ""), 16);
  const r = ((rgb >> 16) & 0xff) / 255;
  const g = ((rgb >> 8) & 0xff) / 255;
  const b = (rgb & 0xff) / 255;
  const toLinear = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

function contrastRatio(fg: string, bg: string): number {
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// ─── Sort ────────────────────────────────────────────────────────────────────

type SortField = "title" | "position" | "updated" | "status" | "feedback";

const KB_SORT_COLUMNS: Record<SortField, SortColumn<KBArticle>> = {
  title: { value: (a) => a.title, defaultDir: "asc" },
  position: {
    compare: (a, b, dir) => (dir === "asc" ? 1 : -1) * (a.position - b.position || a.id - b.id),
    defaultDir: "asc",
  },
  // Pre-existing semantics: "asc" shows newest first. Kept so old ?sort=updated links don't flip.
  updated: {
    compare: (a, b, dir) =>
      (dir === "asc" ? 1 : -1) *
      (new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()),
    defaultDir: "asc",
  },
  status: { value: (a) => a.published, defaultDir: "asc" },
  feedback: { value: (a) => (a.helpful_count ?? 0) + (a.not_helpful_count ?? 0) },
};

// ─── Main Page ───────────────────────────────────────────────────────────────

const ALL_KB_COLUMNS = [
  { key: "title", label: "Title" },
  { key: "description", label: "Description" },
  { key: "categories", label: "Categories" },
  { key: "keywords", label: "Keywords" },
  { key: "status", label: "Status" },
  { key: "feedback", label: "Feedback" },
];

const DEFAULT_KB_COLUMNS = ["title", "categories", "keywords", "status"];

const KBPage: FC = () => {
  let { guildId } = useParams();
  guildId = guildId!;

  const navigate = useNavigate();
  const { selectGuild, selectedGuild } = useGuildStore();

  const { kb: kbPrefs, setKBPrefs } = usePreferencesStore();
  const selectedKBColumns = kbPrefs.columns.length > 0 ? kbPrefs.columns : DEFAULT_KB_COLUMNS;
  const [showKBColumnSelector, setShowKBColumnSelector] = useState(false);

  const toggleKBColumn = (key: string) => {
    if (selectedKBColumns.includes(key)) {
      if (selectedKBColumns.length <= 1) return;
      setKBPrefs({ columns: selectedKBColumns.filter((k) => k !== key) });
    } else {
      setKBPrefs({ columns: [...selectedKBColumns, key] });
    }
  };

  const { data: articles, isLoading: articlesLoading } = useKBArticles(guildId);
  const { data: categories, isLoading: categoriesLoading } = useKBCategories(guildId);

  const createCategory = useCreateKBCategory(guildId);
  const updateCategory = useUpdateKBCategory(guildId);
  const deleteCategory = useDeleteKBCategory(guildId);
  const deleteArticle = useDeleteKBArticle(guildId);
  const reorderArticles = useReorderKBArticles(guildId);

  const [searchParams, setSearchParams] = useSearchParams();

  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryEmoji, setNewCategoryEmoji] = useState("");
  const [editingCategory, setEditingCategory] = useState<{
    id: number;
    name: string;
    emoji: string;
  } | null>(null);
  const [draftOrder, setDraftOrder] = useState<KBCategory[] | null>(null);
  const [currentPage, setCurrentPage] = useState(() => {
    const p = parseInt(searchParams.get("page") ?? "1");
    return isNaN(p) || p < 1 ? 1 : p;
  });

  // Column filters
  const [titleFilter, setTitleFilter] = useState(() => searchParams.get("title") ?? "");
  const [categoryFilter, setCategoryFilter] = useState<number[]>(() => {
    const cats = searchParams.get("categories");
    if (!cats) return [];
    return cats
      .split(",")
      .map(Number)
      .filter((n) => !isNaN(n) && n > 0);
  });
  const [keywordFilter, setKeywordFilter] = useState(() => searchParams.get("keyword") ?? "");
  const [statusFilter, setStatusFilter] = useState<"all" | "published" | "draft">(() => {
    const s = searchParams.get("status");
    if (s === "published" || s === "draft") return s;
    return "all";
  });
  // Premium state
  const [premiumState, setPremiumState] = useState<PremiumState | null>(null);

  // KB Customisation settings
  const canManageBranding = (getGuildById(guildId)?.permission_level ?? 0) >= 2;
  const { data: kbSettings, isLoading: settingsLoading } = useKBSettings(
    guildId,
    canManageBranding,
  );
  const updateSettings = useUpdateKBSettings(guildId);

  const [custPrimaryBg, setCustPrimaryBg] = useState(DEFAULT_PRIMARY_BG);
  const [custCardBg, setCustCardBg] = useState(DEFAULT_CARD_BG);
  const [custTextColour, setCustTextColour] = useState(DEFAULT_TEXT_COLOUR);
  const [custAccentColour, setCustAccentColour] = useState(DEFAULT_ACCENT_COLOUR);
  const [custLogoUrl, setCustLogoUrl] = useState("");
  const [custHideBranding, setCustHideBranding] = useState(false);

  // Initialise customisation form from fetched settings
  useEffect(() => {
    if (kbSettings) {
      setCustPrimaryBg(intToHex(kbSettings.primary_bg, DEFAULT_PRIMARY_BG));
      setCustCardBg(intToHex(kbSettings.card_bg, DEFAULT_CARD_BG));
      setCustTextColour(intToHex(kbSettings.text_colour, DEFAULT_TEXT_COLOUR));
      setCustAccentColour(intToHex(kbSettings.accent_colour, DEFAULT_ACCENT_COLOUR));
      setCustLogoUrl(kbSettings.logo_url ?? "");
      setCustHideBranding(kbSettings.hide_branding);
    }
  }, [kbSettings]);

  // Fetch premium status
  useEffect(() => {
    apiClient.guilds
      .getPremium(guildId, false)
      .then((res) => {
        setPremiumState(res.data);
      })
      .catch(() => {
        // Handled by API interceptor
      });
  }, [guildId]);

  const isPremium = premiumState?.premium === true;

  const custIsDirty = useMemo(() => {
    if (!kbSettings) return false;
    const colourChanged = (current: string, saved: number | null, fallback: string) =>
      current.toUpperCase() !== intToHex(saved, fallback).toUpperCase();
    return (
      colourChanged(custPrimaryBg, kbSettings.primary_bg, DEFAULT_PRIMARY_BG) ||
      colourChanged(custCardBg, kbSettings.card_bg, DEFAULT_CARD_BG) ||
      colourChanged(custTextColour, kbSettings.text_colour, DEFAULT_TEXT_COLOUR) ||
      colourChanged(custAccentColour, kbSettings.accent_colour, DEFAULT_ACCENT_COLOUR) ||
      custLogoUrl !== (kbSettings.logo_url ?? "") ||
      custHideBranding !== kbSettings.hide_branding
    );
  }, [
    kbSettings,
    custPrimaryBg,
    custCardBg,
    custTextColour,
    custAccentColour,
    custLogoUrl,
    custHideBranding,
  ]);

  const hexToInt = (hex: string): number | null => {
    const parsed = parseInt(hex.replace("#", ""), 16);
    return isNaN(parsed) ? null : parsed;
  };

  const handleSaveCustomisation = async () => {
    try {
      await updateSettings.mutateAsync({
        primary_bg: hexToInt(custPrimaryBg),
        card_bg: hexToInt(custCardBg),
        text_colour: hexToInt(custTextColour),
        accent_colour: hexToInt(custAccentColour),
        logo_url: custLogoUrl || null,
        hide_branding: custHideBranding,
      });
      toast.success("Customisation settings saved");
    } catch {
      // Error handled by API interceptor
    }
  };

  const handleResetColours = async () => {
    try {
      await updateSettings.mutateAsync({
        primary_bg: null,
        card_bg: null,
        text_colour: null,
        accent_colour: null,
      });
      setCustPrimaryBg(DEFAULT_PRIMARY_BG);
      setCustCardBg(DEFAULT_CARD_BG);
      setCustTextColour(DEFAULT_TEXT_COLOUR);
      setCustAccentColour(DEFAULT_ACCENT_COLOUR);
      toast.success("Colours reset to defaults");
    } catch {
      // Error handled by API interceptor
    }
  };

  const [deleteArticleModal, setDeleteArticleModal] = useState<{
    isOpen: boolean;
    articleId: number;
    title: string;
  } | null>(null);
  const [deleteCategoryModal, setDeleteCategoryModal] = useState<{
    isOpen: boolean;
    category: KBCategory;
  } | null>(null);

  useEffect(() => {
    const guild = getGuildById(guildId);
    if (guild && (!selectedGuild || selectedGuild.id !== guild.id)) {
      selectGuild(guild);
    }
  }, [guildId, selectGuild, selectedGuild]);

  useEffect(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (titleFilter) next.set("title", titleFilter);
        else next.delete("title");
        if (categoryFilter.length > 0) next.set("categories", categoryFilter.join(","));
        else next.delete("categories");
        if (keywordFilter) next.set("keyword", keywordFilter);
        else next.delete("keyword");
        if (statusFilter !== "all") next.set("status", statusFilter);
        else next.delete("status");
        if (currentPage > 1) next.set("page", String(currentPage));
        else next.delete("page");
        return next;
      },
      { replace: true },
    );
  }, [titleFilter, categoryFilter, keywordFilter, statusFilter, currentPage, setSearchParams]);

  const loading = articlesLoading || categoriesLoading || settingsLoading;

  const sortedCategories = useMemo(
    () => [...(categories ?? [])].sort((a, b) => a.position - b.position || a.id - b.id),
    [categories],
  );

  // While a reorder is in progress the draft wins, so arrow clicks survive refetches.
  const displayedCategories = draftOrder ?? sortedCategories;

  // Drop a pending reorder if a category is added or removed beneath it.
  const categoryIds = sortedCategories.map((c) => c.id).join(",");
  useEffect(() => {
    setDraftOrder(null);
  }, [categoryIds]);

  const handleCreateCategory = async () => {
    const trimmed = newCategoryName.trim();
    if (!trimmed) return;
    try {
      await createCategory.mutateAsync({
        name: trimmed,
        emoji: newCategoryEmoji || null,
        position: sortedCategories.length,
      });
      toast.success("Category created");
      setNewCategoryName("");
      setNewCategoryEmoji("");
    } catch {
      // Error handled by API interceptor
    }
  };

  const handleSaveCategoryEdit = async (category: KBCategory) => {
    if (!editingCategory) return;
    const trimmed = editingCategory.name.trim();
    if (!trimmed) return;
    try {
      await updateCategory.mutateAsync({
        catId: editingCategory.id,
        data: {
          name: trimmed,
          emoji: editingCategory.emoji || null,
          position: category.position,
        },
      });
      toast.success("Category updated");
      setEditingCategory(null);
    } catch {
      // Error handled by API interceptor
    }
  };

  const moveCategory = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= displayedCategories.length) return;
    const next = [...displayedCategories];
    [next[index], next[target]] = [next[target], next[index]];
    setDraftOrder(next);
  };

  const handleSaveCategoryOrder = async () => {
    if (!draftOrder) return;
    const changed = draftOrder
      .map((category, index) => ({ category, index }))
      .filter(({ category, index }) => category.position !== index);

    try {
      await Promise.all(
        changed.map(({ category, index }) =>
          updateCategory.mutateAsync({
            catId: category.id,
            data: { name: category.name, emoji: category.emoji, position: index },
          }),
        ),
      );
      toast.success("Category order saved");
      setDraftOrder(null);
    } catch {
      // Error handled by API interceptor
    }
  };

  const handleDeleteCategory = async () => {
    if (!deleteCategoryModal) return;
    try {
      await deleteCategory.mutateAsync(deleteCategoryModal.category.id);
      toast.success("Category deleted");
      setCategoryFilter((prev) => prev.filter((id) => id !== deleteCategoryModal.category.id));
    } catch {
      // Error handled by API interceptor
    }
    setDeleteCategoryModal(null);
  };

  const handleDeleteArticle = async () => {
    if (!deleteArticleModal) return;
    try {
      await deleteArticle.mutateAsync(deleteArticleModal.articleId);
      toast.success("Article deleted");
    } catch {
      // Error handled by API interceptor
    }
    setDeleteArticleModal(null);
  };

  const filteredArticles = useMemo(() => {
    let result = articles ?? [];

    // Title search
    if (titleFilter) {
      const q = titleFilter.toLowerCase();
      result = result.filter((a) => a.title.toLowerCase().includes(q));
    }

    // Category filter
    if (categoryFilter.length > 0) {
      result = result.filter((a) => categoryFilter.some((catId) => a.category_ids.includes(catId)));
    }

    // Keyword search
    if (keywordFilter) {
      const q = keywordFilter.toLowerCase();
      result = result.filter((a) => a.keywords.some((kw) => kw.toLowerCase().includes(q)));
    }

    // Status filter
    if (statusFilter === "published") {
      result = result.filter((a) => a.published);
    } else if (statusFilter === "draft") {
      result = result.filter((a) => !a.published);
    }

    return result;
  }, [articles, titleFilter, categoryFilter, keywordFilter, statusFilter]);

  const sort = useTableSort(filteredArticles, KB_SORT_COLUMNS, {
    initialSort: { key: "position", dir: "asc" },
    syncToUrl: true,
    persistKey: "kb-articles",
  });

  const sortedArticles = sort.sortedRows;

  // Reset page when filters or sort change
  useEffect(() => {
    setCurrentPage(1);
  }, [titleFilter, categoryFilter, keywordFilter, statusFilter, sort.sortKey, sort.sortDir]);

  const totalPages = Math.max(1, Math.ceil(sortedArticles.length / ARTICLES_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedArticles = sortedArticles.slice(
    (safePage - 1) * ARTICLES_PER_PAGE,
    safePage * ARTICLES_PER_PAGE,
  );

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const getCategoryName = (catId: number): string =>
    categories?.find((c) => c.id === catId)?.name ?? `Category ${catId}`;

  const hasActiveFilters =
    titleFilter || categoryFilter.length > 0 || keywordFilter || statusFilter !== "all";

  const canReorder = !hasActiveFilters && sort.sortKey === "position" && sort.sortDir === "asc";

  const moveArticle = async (articleId: number, delta: number) => {
    const ordered = sortedArticles.map((a) => a.id);
    const index = ordered.indexOf(articleId);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= ordered.length) return;

    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    try {
      await reorderArticles.mutateAsync(ordered);
    } catch {
      // Error handled by API interceptor
    }
  };

  const clearAllFilters = () => {
    setTitleFilter("");
    setCategoryFilter([]);
    setKeywordFilter("");
    setStatusFilter("all");
  };

  const publicKBUrl = `https://${KB_DOMAIN}/kb/${guildId}`;

  const toggleCategoryFilterItem = (catId: number) => {
    setCategoryFilter((prev) =>
      prev.includes(catId) ? prev.filter((id) => id !== catId) : [...prev, catId],
    );
  };

  if (loading) {
    return (
      <MainLayout
        title="Knowledge Base"
        subtitle="Manage articles and categories for your server's knowledge base"
      >
        <TableSkeleton rows={4} columns={4} />
      </MainLayout>
    );
  }

  return (
    <MainLayout
      title="Knowledge Base"
      subtitle="Manage articles and categories for your server's knowledge base"
    >
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <p className="text-gray-300 text-sm">
              {filteredArticles.length}
              {hasActiveFilters ? ` of ${(articles ?? []).length}` : ""} article
              {filteredArticles.length !== 1 ? "s" : ""}
            </p>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearAllFilters}>
                <FontAwesomeIcon icon={faTimes} />
                Clear filters
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <a
              href={publicKBUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded transition-colors"
            >
              <FontAwesomeIcon icon={faExternalLinkAlt} aria-hidden="true" />
              Go to Knowledge Base
            </a>
            <Button variant="primary" onClick={() => navigate(`/manage/${guildId}/kb/create`)}>
              <FontAwesomeIcon icon={faPlus} className="mr-2" aria-hidden="true" />
              Create Article
            </Button>
          </div>
        </div>

        {/* Category management */}
        <Collapsible
          title="Categories"
          subtitle="Manage knowledge base categories"
          defaultOpen={false}
        >
          <div className="space-y-4">
            <div className="flex items-end gap-3">
              <EmojiPicker
                label="Emoji"
                className="w-40 shrink-0"
                value={newCategoryEmoji}
                onChange={setNewCategoryEmoji}
              />
              <TextInput
                label="New Category Name"
                placeholder="e.g. Getting Started"
                value={newCategoryName}
                onChange={setNewCategoryName}
                maxLength={50}
              />
              <Button
                variant="success"
                onClick={handleCreateCategory}
                disabled={!newCategoryName.trim() || createCategory.isPending}
              >
                <FontAwesomeIcon icon={faPlus} className="mr-1" aria-hidden="true" /> Add
              </Button>
            </div>
            {displayedCategories.length === 0 ? (
              <p className="text-gray-300 text-sm">No categories yet. Create one above.</p>
            ) : (
              <>
                <ul className="space-y-2" aria-label="Knowledge base categories">
                  {displayedCategories.map((category, index) => (
                    <li
                      key={category.id}
                      className="flex items-center gap-2 bg-gray-700 rounded px-4 py-2"
                    >
                      <div className="flex flex-col shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          type="button"
                          onClick={() => moveCategory(index, -1)}
                          disabled={index <= 0 || editingCategory !== null}
                          className="px-2 py-0.5 text-gray-300 hover:text-white disabled:text-gray-600 disabled:cursor-default"
                        >
                          <FontAwesomeIcon icon={faArrowUp} aria-hidden="true" />
                          <span className="sr-only">Move {category.name} up</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          type="button"
                          onClick={() => moveCategory(index, 1)}
                          disabled={
                            index >= displayedCategories.length - 1 || editingCategory !== null
                          }
                          className="px-2 py-0.5 text-gray-300 hover:text-white disabled:text-gray-600 disabled:cursor-default"
                        >
                          <FontAwesomeIcon icon={faArrowDown} aria-hidden="true" />
                          <span className="sr-only">Move {category.name} down</span>
                        </Button>
                      </div>

                      {editingCategory?.id === category.id ? (
                        <>
                          <EmojiPicker
                            className="w-40 shrink-0"
                            value={editingCategory.emoji}
                            onChange={(v) =>
                              setEditingCategory((prev) => (prev ? { ...prev, emoji: v } : prev))
                            }
                          />
                          <TextInput
                            value={editingCategory.name}
                            onChange={(v) =>
                              setEditingCategory((prev) => (prev ? { ...prev, name: v } : prev))
                            }
                            maxLength={50}
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            type="button"
                            onClick={() => handleSaveCategoryEdit(category)}
                            disabled={!editingCategory.name.trim() || updateCategory.isPending}
                            className="px-2 py-1 text-green-400 hover:text-green-300 transition-colors"
                            aria-label={`Save category ${category.name}`}
                          >
                            <FontAwesomeIcon icon={faCheck} aria-hidden="true" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            type="button"
                            onClick={() => setEditingCategory(null)}
                            className="px-2 py-1 text-gray-300 hover:text-white transition-colors"
                            aria-label="Cancel editing category"
                          >
                            <FontAwesomeIcon icon={faTimes} aria-hidden="true" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <span className="text-white text-sm grow">
                            {category.emoji && (
                              <span className="mr-2" aria-hidden="true">
                                {category.emoji}
                              </span>
                            )}
                            {category.name}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            type="button"
                            onClick={() =>
                              setEditingCategory({
                                id: category.id,
                                name: category.name,
                                emoji: category.emoji ?? "",
                              })
                            }
                            disabled={draftOrder !== null}
                            className="px-2 py-1 text-gray-300 hover:text-white disabled:text-gray-600 disabled:cursor-default transition-colors"
                            aria-label={`Edit category ${category.name}`}
                          >
                            <FontAwesomeIcon icon={faEdit} aria-hidden="true" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            type="button"
                            onClick={() => setDeleteCategoryModal({ isOpen: true, category })}
                            disabled={draftOrder !== null}
                            className="px-2 py-1 text-red-400 hover:text-red-300 disabled:text-gray-600 disabled:cursor-default transition-colors"
                            aria-label={`Delete category ${category.name}`}
                          >
                            <FontAwesomeIcon icon={faTrash} aria-hidden="true" />
                          </Button>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
                {draftOrder !== null && (
                  <div className="flex items-center gap-3">
                    <Button
                      variant="success"
                      onClick={handleSaveCategoryOrder}
                      disabled={updateCategory.isPending}
                    >
                      {updateCategory.isPending ? "Saving..." : "Save order"}
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => setDraftOrder(null)}
                      disabled={updateCategory.isPending}
                      className="text-gray-300 hover:text-white"
                    >
                      Cancel
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </Collapsible>

        {/* Customisation */}
        {canManageBranding && (
          <Collapsible
            title="Customisation"
            subtitle="Customise the appearance of your public knowledge base"
            defaultOpen={false}
          >
            {!isPremium ? (
              <div className="relative">
                <div className="absolute inset-0 bg-gray-800/80 backdrop-blur-sm rounded-lg flex flex-col items-center justify-center z-10 p-6">
                  <FontAwesomeIcon
                    icon={faLock}
                    className="text-gray-400 text-2xl mb-3"
                    aria-hidden="true"
                  />
                  <p className="text-white font-medium mb-2">
                    Customise colours, branding, and logo for your knowledge base.
                  </p>
                  <a
                    href="/premium"
                    className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded transition-colors mt-2"
                  >
                    View Premium Plans
                  </a>
                </div>
                <div className="opacity-30 pointer-events-none space-y-6 p-1" aria-hidden="true">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <ColourSelect
                      value={DEFAULT_PRIMARY_BG}
                      onChange={() => {}}
                      label="Primary Background"
                    />
                    <ColourSelect
                      value={DEFAULT_CARD_BG}
                      onChange={() => {}}
                      label="Card Background"
                    />
                    <ColourSelect
                      value={DEFAULT_TEXT_COLOUR}
                      onChange={() => {}}
                      label="Text Colour"
                    />
                    <ColourSelect
                      value={DEFAULT_ACCENT_COLOUR}
                      onChange={() => {}}
                      label="Accent Colour"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Colour Scheme */}
                <div>
                  <h4 className="text-white font-medium mb-3">Colour Scheme</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <ColourSelect
                      value={custPrimaryBg}
                      onChange={setCustPrimaryBg}
                      label="Primary Background"
                    />
                    <ColourSelect
                      value={custCardBg}
                      onChange={setCustCardBg}
                      label="Card Background"
                    />
                    <ColourSelect
                      value={custTextColour}
                      onChange={setCustTextColour}
                      label="Text Colour"
                    />
                    <ColourSelect
                      value={custAccentColour}
                      onChange={setCustAccentColour}
                      label="Accent Colour"
                    />
                  </div>
                  {/* Contrast warnings */}
                  {(() => {
                    const warnings: string[] = [];
                    const ratio1 = contrastRatio(custTextColour, custPrimaryBg);
                    const ratio2 = contrastRatio(custTextColour, custCardBg);
                    const ratio3 = contrastRatio(custAccentColour, custPrimaryBg);
                    const ratio4 = contrastRatio(custAccentColour, custCardBg);
                    if (ratio1 < 4.5)
                      warnings.push(`Text on primary background: ${ratio1.toFixed(1)}:1`);
                    if (ratio2 < 4.5)
                      warnings.push(`Text on card background: ${ratio2.toFixed(1)}:1`);
                    if (ratio3 < 3)
                      warnings.push(`Accent on primary background: ${ratio3.toFixed(1)}:1`);
                    if (ratio4 < 3)
                      warnings.push(`Accent on card background: ${ratio4.toFixed(1)}:1`);
                    if (warnings.length === 0) return null;
                    return (
                      <div
                        role="alert"
                        className="mt-3 p-3 bg-yellow-900/30 border border-yellow-700/50 rounded-lg"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-yellow-300 text-sm font-medium mb-1">
                              Contrast warning
                            </p>
                            <ul className="text-yellow-200/80 text-xs space-y-0.5">
                              {warnings.map((w) => (
                                <li key={w}>
                                  {w} (minimum: {w.includes("Accent") ? "3:1" : "4.5:1"})
                                </li>
                              ))}
                            </ul>
                          </div>
                          <a
                            href="https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-yellow-300/70 hover:text-yellow-200 text-xs whitespace-nowrap shrink-0 transition-colors"
                          >
                            Learn more
                          </a>
                        </div>
                      </div>
                    );
                  })()}
                  <Button variant="secondary" onClick={handleResetColours} className="mt-3">
                    <FontAwesomeIcon icon={faTimes} className="text-xs" aria-hidden="true" />
                    Reset colours to defaults
                  </Button>
                </div>

                {/* Logo */}
                <div>
                  <h4 className="text-white font-medium mb-3">Logo</h4>
                  <div className="flex items-end gap-3">
                    <div className="flex-1">
                      <TextInput
                        label="Logo URL"
                        placeholder="https://example.com/logo.png"
                        value={custLogoUrl}
                        onChange={setCustLogoUrl}
                      />
                    </div>
                    {custLogoUrl && (
                      <img
                        src={custLogoUrl}
                        alt="Logo preview"
                        className="w-8 h-8 rounded object-cover border border-gray-600 mb-0.5"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                    )}
                  </div>
                  <p className="text-gray-400 text-xs mt-1">
                    Use a square image, at least 128x128px. Must be HTTPS.
                  </p>
                </div>

                {/* Branding */}
                <div>
                  <h4 className="text-white font-medium mb-3">Branding</h4>
                  <Slider
                    value={custHideBranding}
                    onChange={setCustHideBranding}
                    label="Hide 'Powered by Tickets.bot' footer"
                  />
                </div>

                {/* Save */}
                <div className="flex justify-end">
                  <Button
                    variant="success"
                    onClick={handleSaveCustomisation}
                    disabled={!custIsDirty || updateSettings.isPending}
                  >
                    {updateSettings.isPending ? "Saving..." : "Save Customisation"}
                  </Button>
                </div>
              </div>
            )}
          </Collapsible>
        )}

        {/* Article table */}
        <section aria-label="Articles">
          {(articles ?? []).length > 0 && (
            <div className="hidden sm:flex justify-end mb-3">
              <ColumnSelectorButton
                columns={ALL_KB_COLUMNS}
                selectedColumns={selectedKBColumns}
                onToggleColumn={toggleKBColumn}
                isOpen={showKBColumnSelector}
                onToggle={() => setShowKBColumnSelector(!showKBColumnSelector)}
                onClose={() => setShowKBColumnSelector(false)}
              />
            </div>
          )}
          <div className="bg-gray-800 rounded-xl overflow-hidden">
            {(articles ?? []).length === 0 ? (
              <EmptyState
                icon={faBook}
                title="No articles yet"
                description="Start building your knowledge base to help users find answers."
                action={{
                  label: "Create Article",
                  onClick: () => navigate(`/manage/${guildId}/kb/create`),
                  icon: faPlus,
                }}
              />
            ) : (
              <Table variant="compact" className="bg-gray-800" aria-label="Knowledge base articles">
                <Table.Head>
                  <Table.Row>
                    {selectedKBColumns.includes("title") && (
                      <Table.HeaderCell
                        aria-sort={ariaSortFor(sort, "title")}
                        className="p-4 text-sm font-semibold text-gray-300"
                      >
                        <ColumnFilter
                          label="Title"
                          active={!!titleFilter}
                          labelSlot={
                            <SortTrigger sort={sort} sortKey="title" label="Title" inheritText />
                          }
                        >
                          <TextInput
                            type="text"
                            value={titleFilter}
                            onChange={setTitleFilter}
                            placeholder="Search titles..."
                            className="w-full"
                            autoFocus
                          />
                          <div className="mt-2 border-t border-gray-600 pt-2">
                            <p className="text-xs text-gray-300 mb-1">Sort</p>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => sort.setSort("updated", "asc")}
                              className={`justify-start text-xs px-2 py-1 rounded transition-colors w-full text-left ${
                                sort.sortKey === "updated"
                                  ? "bg-blue-600/20 text-blue-300"
                                  : "text-gray-300 hover:bg-gray-600"
                              }`}
                            >
                              Last updated
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => sort.setSort("position", "asc")}
                              className={`justify-start text-xs px-2 py-1 rounded transition-colors w-full text-left ${
                                canReorder
                                  ? "bg-blue-600/20 text-blue-300"
                                  : "text-gray-300 hover:bg-gray-600"
                              }`}
                            >
                              Manual order
                            </Button>
                          </div>
                        </ColumnFilter>
                      </Table.HeaderCell>
                    )}
                    {selectedKBColumns.includes("description") && (
                      <Table.HeaderCell className="p-4 text-sm font-semibold text-gray-300">
                        Description
                      </Table.HeaderCell>
                    )}
                    {selectedKBColumns.includes("categories") && (
                      <Table.HeaderCell className="p-4 text-sm font-semibold text-gray-300">
                        <ColumnFilter label="Categories" active={categoryFilter.length > 0}>
                          <div className="space-y-1.5 max-h-48 overflow-y-auto">
                            {sortedCategories.map((cat) => (
                              <Checkbox
                                key={cat.id}
                                checked={categoryFilter.includes(cat.id)}
                                onChange={() => toggleCategoryFilterItem(cat.id)}
                                label={`${cat.emoji ? `${cat.emoji} ` : ""}${cat.name}`}
                                className="text-sm text-gray-200 hover:text-white"
                              />
                            ))}
                          </div>
                          {categoryFilter.length > 0 && (
                            <Button variant="ghost" size="sm" onClick={() => setCategoryFilter([])}>
                              Clear
                            </Button>
                          )}
                        </ColumnFilter>
                      </Table.HeaderCell>
                    )}
                    {selectedKBColumns.includes("keywords") && (
                      <Table.HeaderCell className="p-4 text-sm font-semibold text-gray-300">
                        <ColumnFilter label="Keywords" active={!!keywordFilter}>
                          <TextInput
                            type="text"
                            value={keywordFilter}
                            onChange={setKeywordFilter}
                            placeholder="Search keywords..."
                            className="w-full"
                            autoFocus
                          />
                        </ColumnFilter>
                      </Table.HeaderCell>
                    )}
                    {selectedKBColumns.includes("status") && (
                      <Table.HeaderCell
                        aria-sort={ariaSortFor(sort, "status")}
                        className="p-4 text-sm font-semibold text-gray-300"
                      >
                        <ColumnFilter
                          label="Status"
                          active={statusFilter !== "all"}
                          labelSlot={
                            <SortTrigger sort={sort} sortKey="status" label="Status" inheritText />
                          }
                        >
                          <RadioGroup
                            options={[
                              { key: "all", label: "All" },
                              { key: "published", label: "Published" },
                              { key: "draft", label: "Draft" },
                            ]}
                            value={statusFilter}
                            onChange={(val) =>
                              setStatusFilter(val as "all" | "published" | "draft")
                            }
                          />
                        </ColumnFilter>
                      </Table.HeaderCell>
                    )}
                    {selectedKBColumns.includes("feedback") && (
                      <Table.HeaderCell
                        aria-sort={ariaSortFor(sort, "feedback")}
                        className="p-4 text-sm font-semibold text-gray-300"
                        title="Votes from the public knowledge base. Votes cast on Discord are recorded separately and are not counted here."
                      >
                        <SortTrigger sort={sort} sortKey="feedback" label="Feedback" inheritText />
                      </Table.HeaderCell>
                    )}
                    <Table.HeaderCell className="p-4 text-right text-sm font-semibold text-gray-300">
                      Actions
                    </Table.HeaderCell>
                  </Table.Row>
                </Table.Head>
                <Table.Body>
                  {paginatedArticles.length === 0 ? (
                    <Table.Row>
                      <Table.Cell colSpan={selectedKBColumns.length + 1} className="p-0">
                        <EmptyState
                          icon={faBook}
                          title="No articles found"
                          description="No articles match the current filters. Try adjusting your search."
                        />
                      </Table.Cell>
                    </Table.Row>
                  ) : (
                    paginatedArticles.map((article) => (
                      <Table.Row
                        key={article.id}
                        className="border-b border-gray-700 last:border-b-0"
                      >
                        {selectedKBColumns.includes("title") && (
                          <Table.Cell className="p-4 text-sm text-white">
                            {article.title}
                          </Table.Cell>
                        )}
                        {selectedKBColumns.includes("description") && (
                          <Table.Cell className="p-4 text-xs text-gray-400">
                            {article.description ? (
                              <div className="max-w-xs truncate" title={article.description}>
                                {article.description}
                              </div>
                            ) : (
                              <span className="text-gray-500">None</span>
                            )}
                          </Table.Cell>
                        )}
                        {selectedKBColumns.includes("categories") && (
                          <Table.Cell className="p-4 text-sm">
                            <div className="flex flex-wrap gap-1">
                              {article.category_ids.length > 0 ? (
                                article.category_ids.map((catId) => (
                                  <span
                                    key={catId}
                                    className="inline-block bg-gray-700 text-gray-300 text-xs px-2 py-0.5 rounded"
                                  >
                                    {getCategoryName(catId)}
                                  </span>
                                ))
                              ) : (
                                <span className="text-gray-400 text-xs">None</span>
                              )}
                            </div>
                          </Table.Cell>
                        )}
                        {selectedKBColumns.includes("keywords") && (
                          <Table.Cell className="p-4 text-sm">
                            <div className="flex flex-wrap gap-1">
                              {article.keywords.length > 0 ? (
                                article.keywords.slice(0, 3).map((kw) => (
                                  <span
                                    key={kw}
                                    className="inline-block bg-blue-900/40 text-blue-300 text-xs px-2 py-0.5 rounded"
                                  >
                                    {kw}
                                  </span>
                                ))
                              ) : (
                                <span className="text-gray-400 text-xs">None</span>
                              )}
                              {article.keywords.length > 3 && (
                                <span className="text-gray-400 text-xs">
                                  +{article.keywords.length - 3} more
                                </span>
                              )}
                            </div>
                          </Table.Cell>
                        )}
                        {selectedKBColumns.includes("status") && (
                          <Table.Cell className="p-4 text-sm">
                            <span
                              className={`inline-block text-xs px-2 py-0.5 rounded ${
                                article.published
                                  ? "bg-green-900/40 text-green-300"
                                  : "bg-yellow-900/40 text-yellow-300"
                              }`}
                            >
                              {article.published ? "Published" : "Draft"}
                            </span>
                          </Table.Cell>
                        )}
                        {selectedKBColumns.includes("feedback") && (
                          <Table.Cell className="p-4 text-sm whitespace-nowrap">
                            {(article.helpful_count ?? 0) + (article.not_helpful_count ?? 0) ===
                            0 ? (
                              <span className="text-gray-400 text-xs">No votes</span>
                            ) : (
                              <span className="text-xs text-gray-300">
                                <span className="text-green-300">
                                  👍 {article.helpful_count ?? 0}
                                </span>
                                <span className="mx-1.5 text-gray-500">·</span>
                                <span className="text-red-300">
                                  👎 {article.not_helpful_count ?? 0}
                                </span>
                              </span>
                            )}
                          </Table.Cell>
                        )}
                        <Table.Cell className="p-4">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              type="button"
                              onClick={() => moveArticle(article.id, -1)}
                              disabled={
                                !canReorder ||
                                reorderArticles.isPending ||
                                filteredArticles[0]?.id === article.id
                              }
                              title={
                                canReorder
                                  ? "Move up"
                                  : "Clear filters and sort by position to reorder"
                              }
                              className="px-2 py-1 text-gray-300 hover:text-white disabled:text-gray-600 disabled:cursor-default"
                            >
                              <FontAwesomeIcon icon={faArrowUp} aria-hidden="true" />
                              <span className="sr-only">Move {article.title} up</span>
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              type="button"
                              onClick={() => moveArticle(article.id, 1)}
                              disabled={
                                !canReorder ||
                                reorderArticles.isPending ||
                                filteredArticles[filteredArticles.length - 1]?.id === article.id
                              }
                              title={
                                canReorder
                                  ? "Move down"
                                  : "Clear filters and sort by position to reorder"
                              }
                              className="px-2 py-1 text-gray-300 hover:text-white disabled:text-gray-600 disabled:cursor-default"
                            >
                              <FontAwesomeIcon icon={faArrowDown} aria-hidden="true" />
                              <span className="sr-only">Move {article.title} down</span>
                            </Button>
                            <ActionDropdown
                              items={[
                                {
                                  label: "View page",
                                  icon: faExternalLinkAlt,
                                  href: `${publicKBUrl}/${article.slug}`,
                                  external: true,
                                  disabled: !article.published,
                                },
                                {
                                  label: "Edit",
                                  icon: faEdit,
                                  onClick: () =>
                                    navigate(`/manage/${guildId}/kb/edit/${article.id}`),
                                },
                                {
                                  label: "Remove",
                                  icon: faTrash,
                                  variant: "danger",
                                  onClick: () =>
                                    setDeleteArticleModal({
                                      isOpen: true,
                                      articleId: article.id,
                                      title: article.title,
                                    }),
                                },
                              ]}
                            />
                          </div>
                        </Table.Cell>
                      </Table.Row>
                    ))
                  )}
                </Table.Body>
              </Table>
            )}
          </div>
          <Pagination
            variant="full"
            page={safePage}
            totalPages={totalPages}
            onChange={setCurrentPage}
          />
        </section>
      </div>

      <ConfirmModal
        isOpen={!!deleteArticleModal}
        title="Delete Article"
        message={`Are you sure you want to delete the article "${deleteArticleModal?.title}"? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        confirmVariant="danger"
        onConfirm={handleDeleteArticle}
        onCancel={() => setDeleteArticleModal(null)}
      />
      <ConfirmModal
        isOpen={!!deleteCategoryModal}
        title="Delete Category"
        message={`Are you sure you want to delete the category "${deleteCategoryModal?.category.name}"? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        confirmVariant="danger"
        onConfirm={handleDeleteCategory}
        onCancel={() => setDeleteCategoryModal(null)}
      />
    </MainLayout>
  );
};

export default KBPage;
