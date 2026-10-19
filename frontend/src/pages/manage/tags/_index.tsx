import { useCallback, useEffect, useMemo, useRef, useState, type FC } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiClient, SKIP_ERROR_TOAST } from "@/lib/api";
import { guildKeys, useGuildPremium, useGuildTags } from "@/hooks/queries/useGuild";
import { useParams, useSearchParams } from "react-router";
import { getGuildById } from "@/stores/auth";
import { toast } from "sonner";
import { MainLayout } from "@/pages/layout/Main";
import { useGuildStore } from "@/stores/guild";
import Button from "@/components/Button";
import FeatureLockBanner from "@/components/FeatureLockBanner";
import ConfirmModal from "@/components/modals/ConfirmModal";
import TagEditorModal from "@/components/modals/TagEditorModal";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCopy,
  faCrown,
  faEdit,
  faPlus,
  faRotateRight,
  faShareNodes,
  faTag,
  faTrash,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import ActionDropdown from "@/components/ActionDropdown";
import Checkbox from "@/components/Checkbox";
import ColumnFilter from "@/components/ColumnFilter";
import EmptyState from "@/components/EmptyState";
import Table from "@/components/Table";
import TextInput from "@/components/TextInput";
import { SortTrigger, ariaSortFor } from "@/components/SortableHeaderCell";
import { useTableSort } from "@/hooks/useTableSort";
import { matchesSearch } from "@/lib/search";
import type { SortColumn } from "@/lib/table-sort";
import TableSkeleton from "@/components/skeletons/TableSkeleton";
import GallerySubmitModal from "@/components/modals/GallerySubmitModal";
import { useFeatureLock } from "@/hooks/useFeatureLock";
import { FEATURE_TAGS } from "@/lib/feature-flags";
import { HoverTooltip } from "@/components/HoverTooltip";
import type { Tag, TagAliasResyncStatus } from "@/types";
import { useApiErrorHandler } from "@/hooks/useApiErrorHandler";

const RESYNC_TOOLTIP =
  "Use this if a tag's slash command is missing in Discord, still showing after you deleted it, or not responding.";

function resyncButtonLabel(cooldownLeft: number): string {
  if (cooldownLeft <= 0) return "Resync Command Aliases";

  const mins = Math.floor(cooldownLeft / 60);
  return `Discord cooldown — ${mins > 0 ? `${mins}m` : `${cooldownLeft}s`}`;
}

function resyncSummary(status: TagAliasResyncStatus): string {
  const changes = [
    [status.recreated, "recreated"],
    [status.rebound, "relinked"],
    [status.removed, "removed"],
    [status.skipped, "skipped"],
    [status.failed, "failed"],
  ] as const;

  const parts = changes.filter(([count]) => count > 0).map(([count, label]) => `${count} ${label}`);
  if (parts.length === 0) {
    return status.in_sync > 0
      ? `All ${status.in_sync} command aliases are already in sync.`
      : "There are no command aliases to resync.";
  }

  const first = status.errors[0];
  const cause = first ? ` First failure: ${first.tag_id} — ${first.error}.` : "";

  return `Command aliases resynced: ${parts.join(", ")}.${cause} Discord may take a few minutes to show the changes.`;
}

const TAG_TYPES = ["text", "embed", "embed_text", "kb"] as const;
type TagType = (typeof TAG_TYPES)[number];

const TAG_TYPE_LABELS: Record<TagType, string> = {
  text: "Text",
  embed: "Embed",
  embed_text: "Embed + Text",
  kb: "Knowledge Base",
};

function isTagType(value: string): value is TagType {
  return (TAG_TYPES as readonly string[]).includes(value);
}

function tagType(tag: Tag): TagType {
  if (tag.kb_article_id != null) return "kb";
  if (!tag.use_embed) return "text";
  return tag.content ? "embed_text" : "embed";
}

const TAG_SORT_COLUMNS: Record<"id" | "type", SortColumn<Tag>> = {
  id: { value: (t) => t.id, defaultDir: "asc" },
  type: { value: (t) => TAG_TYPE_LABELS[tagType(t)], defaultDir: "asc" },
};

const TagsPage: FC = () => {
  let { guildId } = useParams();
  guildId = guildId!;

  const { selectGuild, selectedGuild } = useGuildStore();
  const queryClient = useQueryClient();
  const { data: tags = {}, isLoading: loading } = useGuildTags(guildId);
  const { data: premiumState = null } = useGuildPremium(guildId, false);
  const { data: premiumWithVoting = null } = useGuildPremium(guildId, true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTag, setEditingTag] = useState<Tag | null>(null);
  const [cloningTag, setCloningTag] = useState(false);
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; tagId: string } | null>(null);
  const [gallerySubmitTag, setGallerySubmitTag] = useState<Tag | null>(null);
  const [resyncStatus, setResyncStatus] = useState<TagAliasResyncStatus | null>(null);
  const [isStartingResync, setIsStartingResync] = useState(false);
  const resyncToastRef = useRef<string | number | null>(null);

  const canPublishToGallery = (getGuildById(guildId)?.permission_level ?? 0) >= 2;

  const { locked: polledLock } = useFeatureLock(FEATURE_TAGS, guildId);
  const [forcedLock, setForcedLock] = useState(false);
  const isLocked = forcedLock || polledLock === true;

  // This page is a long-lived list rather than a form the user navigates away
  // from after one submit, so a forced lock from a 503 must release once the
  // poll confirms the flag is back on, otherwise the page stays locked forever
  // after a single incident even though the flag was re-enabled.
  useEffect(() => {
    if (polledLock === false) {
      setForcedLock(false);
    }
  }, [polledLock]);

  // Announce the lock lifting mid-session (e.g. a flag re-enabled while this page
  // is open). The banner's own aria-live region only reliably announces the
  // unlocked-to-locked transition (see FeatureLockBanner), so the reverse gets a
  // toast instead. Guarded so it never fires on mount, only on a genuine flip.
  const previousLockRef = useRef(isLocked);
  useEffect(() => {
    if (previousLockRef.current && !isLocked) {
      toast.success("Tag changes are available again.");
    }
    previousLockRef.current = isLocked;
  }, [isLocked]);

  useEffect(() => {
    const guild = getGuildById(guildId);
    if (guild) {
      if (!selectedGuild || selectedGuild.id !== guild.id) {
        selectGuild(guild);
      }
    }
  }, [guildId, selectGuild, selectedGuild]);

  const handleLockableError = useApiErrorHandler(
    "Tag management is temporarily unavailable. Please try again shortly.",
    setForcedLock,
  );

  const canResync = premiumWithVoting?.premium ?? false;
  const isResyncRunning = resyncStatus?.status === "running";
  const isResyncing = isResyncRunning || isStartingResync;

  // Ticked locally so the button re-enables without polling
  const [cooldownLeft, setCooldownLeft] = useState(0);
  const cooldownUntil = resyncStatus?.cooldown_until;

  useEffect(() => {
    if (!cooldownUntil) {
      setCooldownLeft(0);
      return;
    }

    const tick = () => {
      const left = Math.max(0, Math.ceil((Date.parse(cooldownUntil) - Date.now()) / 1000));
      setCooldownLeft(left);
      return left;
    };

    if (tick() === 0) return;
    const id = setInterval(() => {
      if (tick() === 0) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [cooldownUntil]);

  const pollResync = useCallback(async () => {
    try {
      const { data } = await apiClient.tags.aliasResyncStatus(guildId);
      setResyncStatus(data);
      return data;
    } catch {
      return null; // the next tick retries
    }
  }, [guildId]);

  // Re-attach to a job left running by an earlier visit
  useEffect(() => {
    if (!canResync) return;

    let cancelled = false;
    void pollResync().then((status) => {
      if (!cancelled && status?.status === "running" && resyncToastRef.current === null) {
        resyncToastRef.current = toast.loading("Resyncing command aliases…", {
          duration: Infinity,
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [canResync, pollResync]);

  useEffect(() => {
    if (!isResyncRunning) return;
    const id = setInterval(() => void pollResync(), 2000);
    return () => clearInterval(id);
  }, [isResyncRunning, pollResync]);

  // Reusing the id replaces the toast in place
  useEffect(() => {
    const toastId = resyncToastRef.current;
    if (!resyncStatus || toastId === null) return;

    if (resyncStatus.status === "running") {
      const progress =
        resyncStatus.total > 0 ? ` ${resyncStatus.processed}/${resyncStatus.total}` : "";
      toast.loading(`Resyncing command aliases…${progress}`, {
        id: toastId,
        duration: Infinity,
      });
      return;
    }

    if (resyncStatus.status === "completed") {
      const summary = resyncSummary(resyncStatus);
      if (resyncStatus.failed > 0) {
        toast.error(summary, { id: toastId, duration: 8000 });
      } else {
        toast.success(summary, { id: toastId, duration: 6000 });
      }

      resyncStatus.warnings.forEach((warning) => toast.warning(warning, { duration: 10000 }));
      resyncToastRef.current = null;
    }
  }, [resyncStatus]);

  // Never leave a spinner behind on a page the user has left.
  useEffect(
    () => () => {
      if (resyncToastRef.current !== null) {
        toast.dismiss(resyncToastRef.current);
        resyncToastRef.current = null;
      }
    },
    [],
  );

  const handleResync = async () => {
    setIsStartingResync(true);
    try {
      const { status, data } = await apiClient.tags.resyncAliases(guildId);
      if (status === 429) {
        toast.warning(data.error ?? "Please wait before resyncing again.");
        if (data.retry_after) {
          setCooldownLeft(data.retry_after);
        }
        return;
      }

      if (status === 409) {
        toast.info("An alias resync is already running for this server.");
      }

      // Track the run even on 409, when something else started it
      if (resyncToastRef.current === null) {
        resyncToastRef.current = toast.loading("Resyncing command aliases…", {
          duration: Infinity,
        });
      }

      await pollResync();
    } catch (error) {
      console.error("Failed to start alias resync:", error);
      handleLockableError(error, "Failed to start the resync. Please try again.");
    } finally {
      setIsStartingResync(false);
    }
  };

  const handleSave = async (tag: Tag, originalId?: string) => {
    try {
      // If the ID was renamed, delete the old one first
      if (originalId && originalId !== tag.id) {
        await apiClient.tags.delete(guildId, originalId, SKIP_ERROR_TOAST);
      }

      await apiClient.tags.upsert(guildId, tag, SKIP_ERROR_TOAST);
      await queryClient.invalidateQueries({ queryKey: guildKeys.tags(guildId) });

      toast.success(cloningTag ? "Tag cloned" : originalId ? "Tag updated" : "Tag created");
      setEditorOpen(false);
      setEditingTag(null);
      setCloningTag(false);
    } catch (error) {
      console.error("Failed to save tag:", error);
      handleLockableError(error, "Failed to save tag. Please try again.");
    }
  };

  const handleDelete = async () => {
    if (!deleteModal) return;

    try {
      await apiClient.tags.delete(guildId, deleteModal.tagId, SKIP_ERROR_TOAST);
      await queryClient.invalidateQueries({ queryKey: guildKeys.tags(guildId) });
      toast.success("Tag deleted");
    } catch (error) {
      console.error("Failed to delete tag:", error);
      handleLockableError(error, "Failed to delete tag. Please try again.");
    }
    setDeleteModal(null);
  };

  const [searchParams, setSearchParams] = useSearchParams();
  const [idFilter, setIdFilter] = useState(() => searchParams.get("id") ?? "");
  const [typeFilter, setTypeFilter] = useState<TagType[]>(
    () => searchParams.get("type")?.split(",").filter(isTagType) ?? [],
  );
  const [aliasOnly, setAliasOnly] = useState(() => searchParams.get("alias") === "1");
  const idQuery = idFilter.trim();

  useEffect(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (idQuery) next.set("id", idQuery);
        else next.delete("id");
        if (typeFilter.length > 0) next.set("type", typeFilter.join(","));
        else next.delete("type");
        if (aliasOnly) next.set("alias", "1");
        else next.delete("alias");
        return next;
      },
      { replace: true },
    );
  }, [idQuery, typeFilter, aliasOnly, setSearchParams]);

  const tagList = useMemo(() => Object.values(tags), [tags]);
  const filteredTags = useMemo(
    () =>
      tagList.filter(
        (t) =>
          matchesSearch(idQuery, t.id) &&
          (typeFilter.length === 0 || typeFilter.includes(tagType(t))) &&
          (!aliasOnly || t.use_guild_command),
      ),
    [tagList, idQuery, typeFilter, aliasOnly],
  );
  const sort = useTableSort(filteredTags, TAG_SORT_COLUMNS, {
    initialSort: { key: "id", dir: "asc" },
    persistKey: "guild-tags",
  });

  const hasActiveFilters = !!idQuery || typeFilter.length > 0 || aliasOnly;
  const hasAliases = tagList.some((t) => t.use_guild_command);

  const clearFilters = () => {
    setIdFilter("");
    setTypeFilter([]);
    setAliasOnly(false);
  };

  const toggleTypeFilter = (type: TagType) => {
    setTypeFilter((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
    );
  };

  if (loading) {
    return (
      <MainLayout
        title={`Tags for ${selectedGuild?.name || "loading..."}`}
        subtitle="Manage canned responses that staff can use in tickets via /tag"
      >
        <FeatureLockBanner
          id="tag-lock-banner"
          locked={isLocked}
          featureLabel="Tag changes"
          existingLabel="tags"
        />
        <TableSkeleton rows={4} columns={3} />
      </MainLayout>
    );
  }

  return (
    <MainLayout
      title={`Tags for ${selectedGuild?.name || "loading..."}`}
      subtitle="Manage canned responses that staff can use in tickets via /tag"
    >
      <FeatureLockBanner
        id="tag-lock-banner"
        locked={isLocked}
        featureLabel="Tag changes"
        existingLabel="tags"
      />
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <p className="text-gray-300 text-sm" role="status">
              {filteredTags.length}
              {hasActiveFilters ? ` of ${tagList.length}` : ""} tag
              {tagList.length !== 1 ? "s" : ""}
            </p>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <FontAwesomeIcon icon={faXmark} />
                Clear filters
              </Button>
            )}
          </div>
          <div className="ml-auto flex items-center gap-3">
            <HoverTooltip
              label={
                <span className="block max-w-xs whitespace-normal">
                  {cooldownLeft > 0
                    ? "Discord is rate limiting this server's commands. Run this again once it clears and it picks up where it stopped."
                    : RESYNC_TOOLTIP}
                  {!canResync && " Requires Premium."}
                </span>
              }
              placement="bottom"
              className="flex"
            >
              <Button
                variant="secondary"
                className="text-sm font-medium"
                visuallyDisabled={!canResync || isLocked || cooldownLeft > 0}
                disabled={isResyncRunning || isStartingResync}
                aria-describedby={isLocked ? "tag-lock-banner" : undefined}
                onClick={handleResync}
              >
                {/* Button's isLoading adds a second spinner and resizes the button */}
                <FontAwesomeIcon
                  icon={faRotateRight}
                  className={`mr-2 ${isResyncing ? "animate-spin" : ""}`}
                />
                {resyncButtonLabel(cooldownLeft)}
                {!canResync && (
                  <FontAwesomeIcon icon={faCrown} className="ml-2 text-amber-400 text-xs" />
                )}
              </Button>
            </HoverTooltip>
            <Button
              variant="success"
              className="text-sm font-medium"
              visuallyDisabled={isLocked}
              aria-describedby={isLocked ? "tag-lock-banner" : undefined}
              onClick={() => {
                setEditingTag(null);
                setEditorOpen(true);
              }}
            >
              <FontAwesomeIcon icon={faPlus} className="mr-2" /> Create Tag
            </Button>
          </div>
        </div>

        <div className="bg-gray-800 rounded-xl overflow-hidden">
          {tagList.length === 0 ? (
            <EmptyState
              icon={faTag}
              title="No tags yet"
              description="Tags are reusable responses your staff can send in tickets."
              // EmptyState has no lock affordance of its own, so when locked the
              // action is omitted entirely rather than left clickable: the banner
              // above is the only explanation available at this point.
              action={
                isLocked
                  ? undefined
                  : { label: "Create Tag", onClick: () => setEditorOpen(true), icon: faPlus }
              }
            />
          ) : (
            <Table>
              <Table.Head>
                <Table.Row>
                  <Table.HeaderCell aria-sort={ariaSortFor(sort, "id")}>
                    <ColumnFilter
                      label="Tag ID"
                      active={!!idQuery || aliasOnly}
                      labelSlot={
                        <SortTrigger
                          sort={sort}
                          sortKey="id"
                          label="Tag ID"
                          inheritText
                          className="font-medium uppercase tracking-wide"
                        />
                      }
                    >
                      <TextInput
                        label="Tag ID"
                        value={idFilter}
                        onChange={setIdFilter}
                        placeholder="Search tag IDs..."
                        autoFocus
                      />
                      {(hasAliases || aliasOnly) && (
                        <div className="mt-2 border-t border-gray-600 pt-2">
                          <Checkbox
                            checked={aliasOnly}
                            onChange={setAliasOnly}
                            label="Has command alias"
                          />
                        </div>
                      )}
                    </ColumnFilter>
                  </Table.HeaderCell>
                  <Table.HeaderCell aria-sort={ariaSortFor(sort, "type")}>
                    <ColumnFilter
                      label="Type"
                      active={typeFilter.length > 0}
                      labelSlot={
                        <SortTrigger
                          sort={sort}
                          sortKey="type"
                          label="Type"
                          inheritText
                          className="font-medium uppercase tracking-wide"
                        />
                      }
                    >
                      <div className="space-y-1.5" role="group" aria-label="Type">
                        {TAG_TYPES.map((type) => (
                          <Checkbox
                            key={type}
                            checked={typeFilter.includes(type)}
                            onChange={() => toggleTypeFilter(type)}
                            label={TAG_TYPE_LABELS[type]}
                            className="text-sm text-gray-200 hover:text-white"
                          />
                        ))}
                      </div>
                      {typeFilter.length > 0 && (
                        <Button variant="ghost" size="sm" onClick={() => setTypeFilter([])}>
                          Clear
                        </Button>
                      )}
                    </ColumnFilter>
                  </Table.HeaderCell>
                  <Table.HeaderCell className="text-right px-3 sm:px-6 py-3">
                    Actions
                  </Table.HeaderCell>
                </Table.Row>
              </Table.Head>
              <Table.Body>
                {sort.sortedRows.length === 0 ? (
                  <Table.Row className="border-b bg-gray-800 border-gray-700">
                    <Table.Cell colSpan={3} className="p-0">
                      <EmptyState
                        icon={faTag}
                        title="No tags found"
                        description="No tags match the current filters."
                      />
                    </Table.Cell>
                  </Table.Row>
                ) : (
                  sort.sortedRows.map((tag) => (
                    <Table.Row key={tag.id}>
                      <Table.Cell className="px-3 sm:px-6 py-4 font-mono text-sm">
                        {tag.id}
                      </Table.Cell>
                      <Table.Cell className="px-3 sm:px-6 py-4 text-sm text-gray-400">
                        {TAG_TYPE_LABELS[tagType(tag)]}
                      </Table.Cell>
                      <Table.Cell className="px-3 sm:px-6 py-4 flex justify-end">
                        <ActionDropdown
                          items={[
                            {
                              label: "Edit",
                              icon: faEdit,
                              onClick: () => {
                                setEditingTag(tag);
                                setEditorOpen(true);
                              },
                            },
                            {
                              label: "Clone",
                              icon: faCopy,
                              onClick: () => {
                                setEditingTag(tag);
                                setCloningTag(true);
                                setEditorOpen(true);
                              },
                            },
                            ...(canPublishToGallery
                              ? [
                                  {
                                    label: "Publish to Gallery",
                                    icon: faShareNodes,
                                    onClick: () => setGallerySubmitTag(tag),
                                  },
                                ]
                              : []),
                            {
                              label: "Remove",
                              icon: faTrash,
                              variant: "danger",
                              disabled: isLocked,
                              onClick: () => setDeleteModal({ isOpen: true, tagId: tag.id }),
                            },
                          ]}
                        />
                      </Table.Cell>
                    </Table.Row>
                  ))
                )}
              </Table.Body>
            </Table>
          )}
        </div>
      </div>

      <TagEditorModal
        isOpen={editorOpen}
        tag={editingTag}
        isPremium={premiumState?.premium ?? false}
        isClone={cloningTag}
        guildId={guildId}
        locked={isLocked}
        onSave={handleSave}
        onClose={() => {
          setEditorOpen(false);
          setEditingTag(null);
          setCloningTag(false);
        }}
      />

      <ConfirmModal
        isOpen={!!deleteModal}
        title="Delete Tag"
        message={`Are you sure you want to delete the tag "${deleteModal?.tagId}"? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        confirmVariant="danger"
        onConfirm={handleDelete}
        onCancel={() => setDeleteModal(null)}
      />

      {gallerySubmitTag && (
        <GallerySubmitModal
          itemType="tag"
          itemId={gallerySubmitTag.id}
          itemTitle={gallerySubmitTag.id}
          guildId={guildId}
          open={!!gallerySubmitTag}
          onClose={() => setGallerySubmitTag(null)}
        />
      )}
    </MainLayout>
  );
};

export default TagsPage;
