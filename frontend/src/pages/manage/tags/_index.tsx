import { useEffect, useMemo, useRef, useState, type FC } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiClient, SKIP_ERROR_TOAST } from "@/lib/api";
import { guildKeys, useGuildPremium, useGuildTags } from "@/hooks/queries/useGuild";
import { useParams } from "react-router";
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
  faEdit,
  faPlus,
  faShareNodes,
  faTag,
  faTrash,
} from "@fortawesome/free-solid-svg-icons";
import ActionDropdown from "@/components/ActionDropdown";
import EmptyState from "@/components/EmptyState";
import Table from "@/components/Table";
import SortableHeaderCell from "@/components/SortableHeaderCell";
import { useTableSort } from "@/hooks/useTableSort";
import type { SortColumn } from "@/lib/table-sort";
import TableSkeleton from "@/components/skeletons/TableSkeleton";
import GallerySubmitModal from "@/components/modals/GallerySubmitModal";
import { useFeatureLock } from "@/hooks/useFeatureLock";
import { FEATURE_TAGS } from "@/lib/feature-flags";
import type { Tag } from "@/types";

const TAG_SORT_COLUMNS: Record<"id" | "type", SortColumn<Tag>> = {
  id: { value: (t) => t.id, defaultDir: "asc" },
  type: { value: (t) => (t.use_embed ? "Embed" : "Text"), defaultDir: "asc" },
};

const TagsPage: FC = () => {
  let { guildId } = useParams();
  guildId = guildId!;

  const { selectGuild, selectedGuild } = useGuildStore();
  const queryClient = useQueryClient();
  const { data: tags = {}, isLoading: loading } = useGuildTags(guildId);
  const { data: premiumState = null } = useGuildPremium(guildId, false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTag, setEditingTag] = useState<Tag | null>(null);
  const [cloningTag, setCloningTag] = useState(false);
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; tagId: string } | null>(null);
  const [gallerySubmitTag, setGallerySubmitTag] = useState<Tag | null>(null);

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

  // SKIP_ERROR_TOAST opts out of the interceptor's toast for every status, not
  // just 503, so every other failure needs its own toast here.
  const handleLockableError = (error: unknown, fallbackMessage: string) => {
    const status = (error as { response?: { status?: number } })?.response?.status;
    const apiError = (error as { response?: { data?: { error?: string } } })?.response?.data?.error;
    if (status === 503) {
      toast.warning(
        apiError ?? "Tag management is temporarily unavailable. Please try again shortly.",
      );
      setForcedLock(true);
    } else {
      toast.error(apiError ?? fallbackMessage);
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

  const tagList = useMemo(() => Object.values(tags), [tags]);
  const sort = useTableSort(tagList, TAG_SORT_COLUMNS, {
    initialSort: { key: "id", dir: "asc" },
    persistKey: "guild-tags",
  });

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
        <div className="flex justify-end">
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
                  <SortableHeaderCell sort={sort} sortKey="id" label="Tag ID" />
                  <SortableHeaderCell sort={sort} sortKey="type" label="Type" />
                  <Table.HeaderCell className="text-right px-3 sm:px-6 py-3">
                    Actions
                  </Table.HeaderCell>
                </Table.Row>
              </Table.Head>
              <Table.Body>
                {sort.sortedRows.map((tag) => (
                  <Table.Row key={tag.id}>
                    <Table.Cell className="px-3 sm:px-6 py-4 font-mono text-sm">
                      {tag.id}
                    </Table.Cell>
                    <Table.Cell className="px-3 sm:px-6 py-4 text-sm text-gray-400">
                      {tag.use_embed ? "Embed" : "Text"}
                      {tag.content && tag.use_embed ? " + Text" : ""}
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
                          {
                            label: "Publish to Gallery",
                            icon: faShareNodes,
                            onClick: () => setGallerySubmitTag(tag),
                          },
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
                ))}
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
