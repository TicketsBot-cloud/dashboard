import { useEffect, useMemo, useRef, useState, type FC } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiClient, SKIP_ERROR_TOAST } from "@/lib/api";
import { Link, useNavigate, useParams } from "react-router";
import {
  guildKeys,
  useGuildGallerySubmissions,
  useGuildMultiPanels,
  useGuildPanels,
  useGuildPremium,
} from "@/hooks/queries/useGuild";

import { getGuildById } from "@/stores/auth";
import { toast } from "sonner";
import { MainLayout } from "@/pages/layout/Main";
import { useGuildStore } from "@/stores/guild";
import type { Panel, GallerySubmission } from "@/types";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCopy,
  faPlus,
  faRectangleList,
  faRotateRight,
  faPencil,
  faTrash,
  faGlobe,
  faShareNodes,
  faLayerGroup,
  faLock,
} from "@fortawesome/free-solid-svg-icons";
import ConfirmModal from "@/components/modals/ConfirmModal";
import Button from "@/components/Button";
import ActionDropdown from "@/components/ActionDropdown";
import PremiumUpgradePrompt from "@/components/PremiumUpgradePrompt";
import GallerySubmitModal from "@/components/modals/GallerySubmitModal";
import EmptyState from "@/components/EmptyState";
import TableSkeleton from "@/components/skeletons/TableSkeleton";
import Table from "@/components/Table";
import SortableHeaderCell from "@/components/SortableHeaderCell";
import FeatureLockBanner from "@/components/FeatureLockBanner";
import { useFeatureLock } from "@/hooks/useFeatureLock";
import { FEATURE_PANELS } from "@/lib/feature-flags";
import { useTableSort } from "@/hooks/useTableSort";
import type { SortColumn } from "@/lib/table-sort";

type PanelSortKey = "channel" | "title" | "status";
type GallerySortKey = "name" | "category" | "status" | "imports";

/** Extracts the status and API-supplied message from an Axios error, for the 503 lock check. */
function readApiError(error: unknown): { status?: number; message?: string } {
  const status = (error as { response?: { status?: number } })?.response?.status;
  const message = (error as { response?: { data?: { error?: string } } })?.response?.data?.error;
  return { status, message };
}

// Ranked by severity so the status column sorts by meaning, not by rendered label.
function statusRank(panel: Panel): number {
  if (panel.force_disabled) return 0;
  if (panel.disabled) return 1;
  if (panel.has_support_hours) return panel.is_currently_active ? 3 : 2;
  return 4;
}

const GALLERY_SORT_COLUMNS: Record<GallerySortKey, SortColumn<GallerySubmission>> = {
  name: { value: (s) => s.name, defaultDir: "asc" },
  category: { value: (s) => s.category, defaultDir: "asc" },
  status: { value: (s) => s.status, defaultDir: "asc" },
  imports: { value: (s) => s.import_count },
};

const PanelsPage: FC = () => {
  let { guildId } = useParams();
  guildId = guildId!;

  const { selectGuild, selectedGuild } = useGuildStore();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: panels = [], isLoading: panelsLoading } = useGuildPanels(guildId);
  const { data: multiPanels = [], isLoading: multiPanelsLoading } = useGuildMultiPanels(guildId);
  const { data: premiumState = null, isLoading: premiumLoading } = useGuildPremium(guildId, false);
  const { data: gallerySubmissions = [], refetch: refetchGallery } = useGuildGallerySubmissions(
    guildId,
    true,
  );

  const loading = panelsLoading || multiPanelsLoading || premiumLoading;

  const panelSortColumns = useMemo<Record<PanelSortKey, SortColumn<Panel>>>(
    () => ({
      channel: {
        value: (p) => selectedGuild?.channels?.find((c) => c.id == p.channel_id)?.name ?? null,
        defaultDir: "asc",
      },
      title: { value: (p) => p.title, defaultDir: "asc" },
      status: { value: (p) => statusRank(p), defaultDir: "asc" },
    }),
    [selectedGuild],
  );

  const panelSort = useTableSort(panels, panelSortColumns, {
    initialSort: { key: "title", dir: "asc" },
    persistKey: "guild-panels",
  });

  const gallerySort = useTableSort(gallerySubmissions, GALLERY_SORT_COLUMNS, {
    initialSort: { key: "name", dir: "asc" },
    persistKey: "guild-gallery-submissions",
  });

  useEffect(() => {
    // Load guild from storage to get the name and check permissions
    const guild = getGuildById(guildId);
    if (guild) {
      // Only select guild if it's not already selected or if it's a different guild
      // This prevents overwriting channels/roles/teams data that parent component fetched
      if (!selectedGuild || selectedGuild.id !== guild.id) {
        selectGuild(guild);
      }
    }
  }, [guildId, selectGuild, selectedGuild]);

  const [deleteModal, setDeleteModal] = useState<{
    isOpen: boolean;
    type: "panel" | "multipanel";
    id: string;
    name: string;
  } | null>(null);
  const [gallerySubmitPanel, setGallerySubmitPanel] = useState<Panel | null>(null);
  const [galleryEditSubmission, setGalleryEditSubmission] = useState<GallerySubmission | null>(
    null,
  );

  const { locked: polledLock } = useFeatureLock(FEATURE_PANELS, guildId);
  const [forcedLock, setForcedLock] = useState(false);
  const isLocked = forcedLock || polledLock === true;

  // This page is a long-lived list rather than a form the user navigates away
  // from after one submit (unlike panels create/edit), so a forced lock from a
  // 503 must release once the poll confirms the flag is back on, otherwise the
  // page stays locked forever after a single incident even though the flag was
  // re-enabled.
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
      toast.success("Panel changes are available again.");
    }
    previousLockRef.current = isLocked;
  }, [isLocked]);

  const handleDelete = async () => {
    if (!deleteModal) return;

    const isPanel = deleteModal.type === "panel";

    try {
      if (isPanel) {
        await apiClient.panels.delete(guildId, deleteModal.id, SKIP_ERROR_TOAST);
        await queryClient.invalidateQueries({ queryKey: guildKeys.panels(guildId) });
        toast.success("Panel deleted successfully");
      } else {
        await apiClient.multiPanels.delete(guildId, deleteModal.id, SKIP_ERROR_TOAST);
        await queryClient.invalidateQueries({ queryKey: guildKeys.multiPanels(guildId) });
        toast.success("Multi-panel deleted successfully");
      }
    } catch (error) {
      const { status, message } = readApiError(error);
      if (status === 503) {
        toast.warning(
          message ??
            `${isPanel ? "Panel" : "Multi-panel"} management is temporarily unavailable. Please try again shortly.`,
        );
        setForcedLock(true);
      } else {
        // SKIP_ERROR_TOAST opts out of the interceptor's toast for every
        // status, not just 503, so every other failure needs its own here.
        toast.error(
          message ?? `Failed to delete ${isPanel ? "panel" : "multi-panel"}. Please try again.`,
        );
      }
      console.error("Failed to delete:", error);
    }

    setDeleteModal(null);
  };

  if (loading) {
    return (
      <MainLayout
        title={`Panels for ${selectedGuild?.name || "loading..."}`}
        subtitle="View and manage all panels and multi-panels"
      >
        <FeatureLockBanner
          id="panel-lock-banner"
          locked={isLocked}
          featureLabel="Panel changes"
          existingLabel="panels"
        />
        <TableSkeleton rows={4} columns={3} />
      </MainLayout>
    );
  }

  return (
    <MainLayout
      title={`Panels for ${selectedGuild?.name || "loading..."}`}
      subtitle="View and manage all panels and multi-panels"
    >
      <FeatureLockBanner
        id="panel-lock-banner"
        locked={isLocked}
        featureLabel="Panel changes"
        existingLabel="panels"
      />
      {!premiumState?.premium && panels.length >= 3 && (
        <div className="pb-4">
          <PremiumUpgradePrompt message="You've reached the free panel limit. Premium includes unlimited panels, autoclose, exit surveys, and analytics." />
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-gray-800 rounded-xl overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4">
            <h2 className="text-xl font-medium">Panels</h2>
            <div className="flex items-center gap-2">
              <Link to="/gallery">
                <Button variant="secondary" disabled={!premiumState?.premium && panels.length >= 3}>
                  <FontAwesomeIcon icon={faGlobe} className="mr-1" /> Browse Gallery
                </Button>
              </Link>
              <Link
                to={
                  isLocked || (!premiumState?.premium && panels.length >= 3)
                    ? "#"
                    : `/manage/${guildId}/panels/create`
                }
              >
                <Button
                  variant="primary"
                  disabled={isLocked || (!premiumState?.premium && panels.length >= 3)}
                >
                  <FontAwesomeIcon icon={faPlus} /> Create Panel
                </Button>
              </Link>
            </div>
          </div>
          <hr className="text-gray-700" />
          <div className="p-4 bg-gray-800 rounded-xl">
            <div>
              You've used <strong>{panels.length}</strong> out of{" "}
              <strong>{premiumState?.premium ? "unlimited" : 3}</strong> panels
            </div>
            <Table variant="compact" className="mt-4">
              <Table.Head>
                <Table.Row>
                  <SortableHeaderCell sort={panelSort} sortKey="channel" label="Channel" />
                  <SortableHeaderCell sort={panelSort} sortKey="title" label="Panel Name" />
                  <SortableHeaderCell
                    sort={panelSort}
                    sortKey="status"
                    label="Status"
                    className="hidden sm:table-cell"
                  />
                  <Table.HeaderCell className="px-4 py-3 text-right">Action</Table.HeaderCell>
                </Table.Row>
              </Table.Head>
              <Table.Body>
                {panels.length === 0 ? (
                  <Table.Row>
                    <Table.Cell colSpan={4} className="p-0">
                      <EmptyState
                        icon={faRectangleList}
                        title="No panels created yet"
                        description="Panels let users open tickets in your server. Create one to get started."
                        action={{
                          label: "Create Panel",
                          onClick: () => {
                            if (isLocked) return;
                            navigate(`/manage/${guildId}/panels/create`);
                          },
                          icon: faPlus,
                        }}
                      />
                    </Table.Cell>
                  </Table.Row>
                ) : (
                  panelSort.sortedRows.map((panel) => (
                    <Table.Row
                      key={panel.panel_id}
                      className={`border-b border-gray-700 hover:bg-gray-800/50 ${
                        panel.disabled || panel.force_disabled ? "opacity-50" : ""
                      }`}
                    >
                      <Table.Cell>
                        #{selectedGuild?.channels?.find((c) => c.id == panel.channel_id)?.name}
                      </Table.Cell>
                      <Table.Cell>{panel.title}</Table.Cell>
                      <Table.Cell className="px-4 py-3 hidden sm:table-cell">
                        {panel.force_disabled ? (
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-red-500/20 text-red-400 whitespace-nowrap"
                            title="Over the free panel limit. Reactivate premium or remove another panel to restore it."
                          >
                            <FontAwesomeIcon icon={faLock} className="w-3 h-3" />
                            Force Disabled
                          </span>
                        ) : panel.disabled ? (
                          <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-gray-500/20 text-gray-400">
                            Disabled
                          </span>
                        ) : panel.has_support_hours ? (
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${panel.is_currently_active ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}
                          >
                            {panel.is_currently_active ? "Open" : "Closed"}
                          </span>
                        ) : (
                          <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-blue-500/20 text-blue-400">
                            24/7
                          </span>
                        )}
                      </Table.Cell>
                      <Table.Cell>
                        <div className="flex justify-end">
                          <ActionDropdown
                            items={[
                              {
                                label: "Resend",
                                icon: faRotateRight,
                                disabled: panel.force_disabled || isLocked,
                                onClick: () =>
                                  apiClient.panels
                                    .resend(guildId, panel.panel_id.toString(), SKIP_ERROR_TOAST)
                                    .then(() => toast.success("Successfully re-sent panel"))
                                    .catch((error) => {
                                      const { status, message } = readApiError(error);
                                      if (status === 503) {
                                        toast.warning(
                                          message ??
                                            "Panel management is temporarily unavailable. Please try again shortly.",
                                        );
                                        setForcedLock(true);
                                      } else {
                                        toast.error(
                                          message ?? "Failed to re-send panel. Please try again.",
                                        );
                                      }
                                      console.error("Failed to re-send panel:", error);
                                    }),
                              },
                              {
                                label: "Edit",
                                icon: faPencil,
                                disabled: panel.force_disabled,
                                onClick: () =>
                                  navigate(`/manage/${guildId}/panels/edit/${panel.panel_id}`),
                              },
                              {
                                label: "Clone",
                                icon: faCopy,
                                disabled: panel.force_disabled || isLocked,
                                onClick: () => {
                                  if (isLocked) return;
                                  if (!premiumState?.premium && panels.length >= 3) {
                                    toast.warning("Cannot clone due to panel limits");
                                  }
                                  navigate(
                                    !premiumState?.premium && panels.length >= 3
                                      ? "#"
                                      : `/manage/${guildId}/panels/create?clone=${panel.panel_id}`,
                                  );
                                },
                              },
                              {
                                label: "Publish to Gallery",
                                icon: faShareNodes,
                                disabled: panel.force_disabled,
                                onClick: () => setGallerySubmitPanel(panel),
                              },
                              {
                                label: "Remove",
                                icon: faTrash,
                                disabled: isLocked,
                                onClick: () =>
                                  setDeleteModal({
                                    isOpen: true,
                                    type: "panel",
                                    id: panel.panel_id.toString(),
                                    name: panel.title,
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
          </div>
        </div>
        <div className="bg-gray-800 rounded-xl overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4">
            <h2 className="text-xl font-medium">Multi-Panels</h2>
            <Link
              to={isLocked || panels.length < 2 ? "#" : `/manage/${guildId}/panels/multi/create`}
            >
              <Button variant="primary" disabled={isLocked || panels.length < 2}>
                <FontAwesomeIcon icon={faPlus} /> Create Multi-Panel
              </Button>
            </Link>
          </div>
          <hr className="text-gray-700" />
          <div className="p-4 bg-gray-800 rounded-xl">
            <div>You'll need at least 2 panels to create a multi-panel.</div>
            <Table variant="compact" className="mt-4">
              <Table.Head>
                <Table.Row>
                  <Table.HeaderCell>Panel Name</Table.HeaderCell>
                  <Table.HeaderCell className="px-4 py-3 text-right">Action</Table.HeaderCell>
                </Table.Row>
              </Table.Head>
              <Table.Body>
                {!multiPanels || multiPanels.length === 0 ? (
                  <Table.Row>
                    <Table.Cell colSpan={2} className="p-0">
                      <EmptyState
                        icon={faLayerGroup}
                        title="No multi-panels yet"
                        description="Multi-panels combine multiple panels into a single message. Create at least 2 panels first."
                      />
                    </Table.Cell>
                  </Table.Row>
                ) : (
                  multiPanels.map((panel) => (
                    <Table.Row key={panel.id}>
                      <Table.Cell>{panel.title}</Table.Cell>

                      <Table.Cell>
                        <div className="flex justify-end">
                          <ActionDropdown
                            items={[
                              {
                                label: "Resend",
                                icon: faRotateRight,
                                disabled: isLocked,
                                onClick: () =>
                                  apiClient.multiPanels
                                    .resend(guildId, panel.id.toString(), SKIP_ERROR_TOAST)
                                    .then(() => toast.success("Successfully re-sent multi panel"))
                                    .catch((error) => {
                                      const { status, message } = readApiError(error);
                                      if (status === 503) {
                                        toast.warning(
                                          message ??
                                            "Panel management is temporarily unavailable. Please try again shortly.",
                                        );
                                        setForcedLock(true);
                                      } else {
                                        toast.error(
                                          message ??
                                            "Failed to re-send multi panel. Please try again.",
                                        );
                                      }
                                      console.error("Failed to re-send multi panel:", error);
                                    }),
                              },
                              {
                                label: "Edit",
                                icon: faPencil,
                                onClick: () =>
                                  navigate(`/manage/${guildId}/panels/multi/edit/${panel.id}`),
                              },
                              {
                                label: "Remove",
                                icon: faTrash,
                                disabled: isLocked,
                                onClick: () =>
                                  setDeleteModal({
                                    isOpen: true,
                                    type: "multipanel",
                                    id: panel.id.toString(),
                                    name: panel.title || "Multi-panel",
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
          </div>
        </div>
      </div>

      {/* Gallery Submissions Section */}
      {gallerySubmissions.length > 0 && (
        <div className="bg-gray-800 rounded-xl overflow-hidden mt-6">
          <div className="flex items-center justify-between p-4">
            <h2 className="text-xl font-medium">Gallery Submissions</h2>
          </div>
          <hr className="text-gray-700" />
          <div className="p-4">
            <Table variant="compact" className="min-w-125">
              <Table.Head>
                <Table.Row>
                  <SortableHeaderCell sort={gallerySort} sortKey="name" label="Name" />
                  <SortableHeaderCell sort={gallerySort} sortKey="category" label="Category" />
                  <SortableHeaderCell sort={gallerySort} sortKey="status" label="Status" />
                  <SortableHeaderCell
                    sort={gallerySort}
                    sortKey="imports"
                    label="Imports"
                    className="hidden sm:table-cell"
                  />
                  <Table.HeaderCell className="px-4 py-3 text-right">Action</Table.HeaderCell>
                </Table.Row>
              </Table.Head>
              <Table.Body>
                {gallerySort.sortedRows.map((sub) => (
                  <Table.Row key={sub.id}>
                    <Table.Cell>{sub.name}</Table.Cell>
                    <Table.Cell>
                      <span className="bg-blue-600/20 text-blue-400 rounded-full px-2.5 py-0.5 text-xs font-medium">
                        {sub.category}
                      </span>
                    </Table.Cell>
                    <Table.Cell>
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                          sub.status === "approved"
                            ? "bg-green-500/20 text-green-400"
                            : sub.status === "rejected"
                              ? "bg-red-500/20 text-red-400"
                              : "bg-yellow-500/20 text-yellow-400"
                        }`}
                      >
                        {sub.status.charAt(0).toUpperCase() + sub.status.slice(1)}
                      </span>
                      {sub.status === "rejected" && sub.review_note && (
                        <span className="text-xs text-gray-400 ml-2" title={sub.review_note}>
                          -{" "}
                          {sub.review_note.length > 50
                            ? sub.review_note.slice(0, 50) + "…"
                            : sub.review_note}
                        </span>
                      )}
                    </Table.Cell>
                    <Table.Cell className="px-4 py-3 text-gray-400 hidden sm:table-cell">
                      {sub.import_count}
                    </Table.Cell>
                    <Table.Cell>
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => setGalleryEditSubmission(sub)}
                        >
                          <FontAwesomeIcon icon={faPencil} className="mr-1" />
                          Edit
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={async () => {
                            try {
                              await apiClient.gallery.withdraw(guildId, sub.id);
                              void refetchGallery();
                              toast.success("Gallery submission withdrawn.");
                            } catch {
                              // Error handled by interceptor
                            }
                          }}
                        >
                          <FontAwesomeIcon icon={faTrash} className="mr-1" />
                          {sub.status === "approved" ? "Unpublish" : "Withdraw"}
                        </Button>
                      </div>
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={!!deleteModal}
        title="Confirm Deletion"
        message={`Are you sure you want to delete "${deleteModal?.name || ""}"? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        confirmVariant="danger"
        onConfirm={handleDelete}
        onCancel={() => setDeleteModal(null)}
      />

      {(gallerySubmitPanel || galleryEditSubmission) && (
        <GallerySubmitModal
          itemType="panel"
          itemId={gallerySubmitPanel?.panel_id ?? 0}
          itemTitle={gallerySubmitPanel?.title ?? galleryEditSubmission?.name ?? ""}
          guildId={guildId}
          open={!!(gallerySubmitPanel || galleryEditSubmission)}
          onClose={() => {
            setGallerySubmitPanel(null);
            setGalleryEditSubmission(null);
          }}
          existingSubmission={galleryEditSubmission ?? undefined}
          onSubmitted={() => {
            void refetchGallery();
          }}
        />
      )}
    </MainLayout>
  );
};

export default PanelsPage;
