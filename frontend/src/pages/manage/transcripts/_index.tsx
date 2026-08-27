import { useCallback, useEffect, useMemo, useState, type FC } from "react";
import { apiClient } from "@/lib/api";
import { Link, useParams, useSearchParams } from "react-router";
import { getGuildById } from "@/stores/auth";
import { usePreferencesStore } from "@/stores/preferences";
import { toast } from "sonner";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faEye,
  faPencil,
  faScroll,
  faTag,
  faTrash,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import ColumnSelectorButton from "@/components/ColumnSelectorButton";
import Button from "@/components/Button";
import Table from "@/components/Table";
import { SortTrigger, ariaSortFor } from "@/components/SortableHeaderCell";
import ColumnFilter from "@/components/ColumnFilter";
import { useSortState, type SortableColumns } from "@/hooks/useTableSort";
import Pagination from "@/components/Pagination";
import TextInput from "@/components/TextInput";
import Textarea from "@/components/Textarea";
import Select from "@/components/Select";
import LabelBadge from "@/components/LabelBadge";
import LabelAssignDropdown from "@/components/LabelAssignDropdown";
import ColourSelect from "@/components/ColourSelect";
import ActionDropdown from "@/components/ActionDropdown";
import ActionModal from "@/components/modal-primitives/ActionModal";
import DismissibleModal from "@/components/modal-primitives/DismissibleModal";
import EmptyState from "@/components/EmptyState";
import { MainLayout } from "@/pages/layout/Main";
import { useGuildStore } from "@/stores/guild";
import Skeleton from "react-loading-skeleton";
import type { Panel, Ticket, TicketLabel } from "@/types";

type ColumnKey = "id" | "username" | "rating" | "close_reason" | "labels";

// Server-side sort: keys must match database.SortBy in the Go query builder.
type SortKey = "id" | "rating" | "close_reason";

const SORT_COLUMNS: SortableColumns<SortKey> = {
  id: {},
  rating: { defaultDir: "asc" },
  close_reason: { defaultDir: "asc" },
};

const RATING_OPTIONS = [
  { key: "0", label: "Any" },
  { key: "1", label: "1 ⭐" },
  { key: "2", label: "2 ⭐" },
  { key: "3", label: "3 ⭐" },
  { key: "4", label: "4 ⭐" },
  { key: "5", label: "5 ⭐" },
];

interface ColumnDef {
  key: ColumnKey;
  label: string;
  responsiveClass: string;
  sortKey?: SortKey;
}

const ALL_COLUMNS: ColumnDef[] = [
  { key: "id", label: "Ticket ID", responsiveClass: "", sortKey: "id" },
  { key: "username", label: "Username", responsiveClass: "hidden sm:table-cell" },
  { key: "rating", label: "Rating", responsiveClass: "hidden md:table-cell", sortKey: "rating" },
  {
    key: "close_reason",
    label: "Close Reason",
    responsiveClass: "hidden lg:table-cell",
    sortKey: "close_reason",
  },
  { key: "labels", label: "Labels", responsiveClass: "hidden lg:table-cell" },
];

const DEFAULT_COLUMNS: ColumnKey[] = ["id", "username", "rating", "close_reason", "labels"];

function intToColour(colour: number): string {
  return `#${colour.toString(16).padStart(6, "0")}`;
}

function colourToInt(hex: string): number {
  return parseInt(hex.replace("#", ""), 16);
}

const TranscriptsPage: FC = () => {
  let { guildId } = useParams();
  guildId = guildId!;

  const { selectGuild, selectedGuild } = useGuildStore();
  const isAdmin = getGuildById(guildId)?.permission_level === 2;

  useEffect(() => {
    const guild = getGuildById(guildId);
    if (guild) {
      if (!selectedGuild || selectedGuild.id !== guild.id) {
        selectGuild(guild);
      }

      if (guild.permission_level < 1) {
        toast.warning(
          "You do not have permission to manage this server's transcripts. Please contact an administrator.",
        );
      }
    }
  }, [guildId, selectGuild, selectedGuild]);

  const [transcripts, setTranscripts] = useState<Ticket[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const [searchParams, setSearchParams] = useSearchParams();

  // Filters
  const [ticketId, setTicketId] = useState(() => searchParams.get("ticket_id") ?? "");
  const [username, setUsername] = useState(() => searchParams.get("username") ?? "");
  const [userId, setUserId] = useState(() => searchParams.get("user_id") ?? "");
  const [closedBy, setClosedBy] = useState(() => searchParams.get("closed_by") ?? "");
  const [rating, setRating] = useState(() => searchParams.get("rating") ?? "0");
  const [claimedBy, setClaimedBy] = useState(() => searchParams.get("claimed_by") ?? "");
  const [closeReason, setCloseReason] = useState(() => searchParams.get("close_reason") ?? "");
  const sort = useSortState(SORT_COLUMNS, {
    initialSort: { key: "id", dir: "desc" },
    syncToUrl: true,
    persistKey: "transcripts",
  });

  const [panels, setPanels] = useState<Panel[]>([]);
  const [panel, setPanel] = useState<string>(() => searchParams.get("panel") ?? "");
  const [labels, setLabels] = useState<TicketLabel[]>([]);
  const [selectedLabelIds, setSelectedLabelIds] = useState<number[]>(() => {
    const labelsParam = searchParams.get("labels");
    if (!labelsParam) return [];
    return labelsParam
      .split(",")
      .map(Number)
      .filter((n) => !isNaN(n) && n > 0);
  });

  // Label management
  const [showLabelManageModal, setShowLabelManageModal] = useState(false);
  const [showLabelEditor, setShowLabelEditor] = useState(false);
  const [newLabelName, setNewLabelName] = useState("");
  const [newLabelColour, setNewLabelColour] = useState("#5865F2");

  // Column visibility
  const { transcripts: transcriptPrefs, setTranscriptPrefs } = usePreferencesStore();
  const selectedColumns = (
    transcriptPrefs.columns.length > 0 ? transcriptPrefs.columns : DEFAULT_COLUMNS
  ) as string[];
  const [showColumnSelector, setShowColumnSelector] = useState(false);

  // Edit close reason
  const [editingTicketId, setEditingTicketId] = useState<number | null>(null);
  const [editReason, setEditReason] = useState("");

  const visibleColumns = useMemo(
    () => ALL_COLUMNS.filter((col) => selectedColumns.includes(col.key)),
    [selectedColumns],
  );

  const toggleColumn = (key: ColumnKey) => {
    if (selectedColumns.includes(key)) {
      if (selectedColumns.length <= 1) return;
      setTranscriptPrefs({ columns: selectedColumns.filter((k) => k !== key) });
    } else {
      setTranscriptPrefs({ columns: [...selectedColumns, key] });
    }
  };

  const buildRequestBody = useCallback(
    (targetPage: number) => ({
      page: targetPage,
      id: ticketId || null,
      username: username || null,
      user_id: userId || null,
      closed_by_id: closedBy || null,
      rating: rating,
      claimed_by_id: claimedBy || null,
      close_reason: closeReason || null,
      panel_id: panel ? Number(panel) : null,
      label_ids: selectedLabelIds.length > 0 ? selectedLabelIds : null,
      sort_by: sort.sortKey,
      sort_dir: sort.sortDir,
    }),
    [
      ticketId,
      username,
      userId,
      closedBy,
      rating,
      claimedBy,
      closeReason,
      panel,
      selectedLabelIds,
      sort.sortKey,
      sort.sortDir,
    ],
  );

  const fetchTranscripts = useCallback(
    async (targetPage: number) => {
      try {
        const guild = getGuildById(guildId);
        if (guild && guild.permission_level < 1) return;
        setLoading(true);
        const response = await apiClient.transcripts.list(guildId, buildRequestBody(targetPage));
        setTranscripts(response.data.transcripts ?? []);
        setTotalPages(response.data.total_pages ?? 1);
        setTotalCount(response.data.total_count ?? 0);
        setPage(targetPage);
      } catch (error) {
        console.error("Failed to fetch transcripts:", error);
      } finally {
        setLoading(false);
      }
    },
    [guildId, buildRequestBody],
  );

  // Fetch transcripts on filter change (debounced)
  useEffect(() => {
    const handler = setTimeout(() => fetchTranscripts(1), 500);
    return () => clearTimeout(handler);
  }, [
    ticketId,
    username,
    userId,
    closedBy,
    rating,
    claimedBy,
    closeReason,
    panel,
    selectedLabelIds,
    guildId,
    fetchTranscripts,
  ]);

  useEffect(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (ticketId) next.set("ticket_id", ticketId);
        else next.delete("ticket_id");
        if (username) next.set("username", username);
        else next.delete("username");
        if (userId) next.set("user_id", userId);
        else next.delete("user_id");
        if (closedBy) next.set("closed_by", closedBy);
        else next.delete("closed_by");
        if (rating !== "0") next.set("rating", rating);
        else next.delete("rating");
        if (claimedBy) next.set("claimed_by", claimedBy);
        else next.delete("claimed_by");
        if (closeReason) next.set("close_reason", closeReason);
        else next.delete("close_reason");
        if (panel) next.set("panel", panel);
        else next.delete("panel");
        if (selectedLabelIds.length > 0) next.set("labels", selectedLabelIds.join(","));
        else next.delete("labels");
        return next;
      },
      { replace: true },
    );
  }, [
    ticketId,
    username,
    userId,
    closedBy,
    rating,
    claimedBy,
    closeReason,
    panel,
    selectedLabelIds,
    setSearchParams,
  ]);

  // Fetch panels and labels on mount
  useEffect(() => {
    const fetchPanels = async () => {
      try {
        const response = await apiClient.panels.getByGuild(guildId);
        setPanels(response.data);
      } catch (error) {
        console.error("Failed to fetch panels:", error);
      }
    };

    const fetchLabels = async () => {
      try {
        const response = await apiClient.ticketLabels.getByGuild(guildId);
        setLabels(response.data ?? []);
      } catch (error) {
        console.error("Failed to fetch labels:", error);
      }
    };

    fetchPanels();
    fetchLabels();
  }, [guildId]);

  // Label filter toggle
  const toggleLabelFilter = (labelId: number) => {
    setSelectedLabelIds((prev) =>
      prev.includes(labelId) ? prev.filter((id) => id !== labelId) : [...prev, labelId],
    );
  };

  // Label CRUD
  const createLabel = async () => {
    if (!newLabelName.trim()) return;
    try {
      const response = await apiClient.ticketLabels.create(
        guildId,
        newLabelName.trim(),
        colourToInt(newLabelColour),
      );
      setLabels((prev) => [...prev, response.data]);
      setNewLabelName("");
      setNewLabelColour("#5865F2");
      setShowLabelEditor(false);
      toast.success("Label created");
    } catch (error) {
      console.error("Failed to create label:", error);
    }
  };

  const deleteLabel = async (labelId: number) => {
    try {
      await apiClient.ticketLabels.delete(guildId, labelId);
      setLabels((prev) => prev.filter((l) => l.label_id !== labelId));
      setSelectedLabelIds((prev) => prev.filter((id) => id !== labelId));
      toast.success("Label deleted");
    } catch (error) {
      console.error("Failed to delete label:", error);
    }
  };

  // Label assignment
  const assignLabels = async (ticketIdToAssign: number, labelIds: number[]) => {
    try {
      await apiClient.tickets.assignLabels(guildId, ticketIdToAssign, labelIds);
      setTranscripts((prev) =>
        prev.map((t) => {
          if (t.ticket_id === ticketIdToAssign) {
            return {
              ...t,
              labels: labels.filter((l) => labelIds.includes(l.label_id)),
            };
          }
          return t;
        }),
      );
      toast.success("Labels updated");
    } catch (error) {
      console.error("Failed to assign labels:", error);
    }
  };

  // Close reason
  const saveCloseReason = async () => {
    if (editingTicketId === null) return;
    try {
      await apiClient.tickets.updateCloseReason(guildId, editingTicketId, editReason || null);
      setTranscripts((prev) =>
        prev.map((t) =>
          t.ticket_id === editingTicketId ? { ...t, close_reason: editReason || undefined } : t,
        ),
      );
      setEditingTicketId(null);
      setEditReason("");
      toast.success("Close reason updated");
    } catch (error) {
      console.error("Failed to update close reason:", error);
    }
  };

  // Header filters can be hidden by the column selector; surfaced here so none stay stuck on.
  const activeFilters = [
    ticketId && { label: `Ticket ID: ${ticketId}`, clear: () => setTicketId("") },
    username && { label: `Username: ${username}`, clear: () => setUsername("") },
    userId && { label: `User ID: ${userId}`, clear: () => setUserId("") },
    rating !== "0" && { label: `Rating: ${rating}`, clear: () => setRating("0") },
    closeReason && { label: `Close Reason: ${closeReason}`, clear: () => setCloseReason("") },
    selectedLabelIds.length > 0 && {
      label: `Labels: ${selectedLabelIds.length}`,
      clear: () => setSelectedLabelIds([]),
    },
  ].filter((f): f is { label: string; clear: () => void } => Boolean(f));

  const sortTrigger = (col: ColumnDef) =>
    col.sortKey ? (
      <SortTrigger sort={sort} sortKey={col.sortKey} label={col.label} inheritText />
    ) : undefined;

  const renderHeader = (col: ColumnDef) => {
    switch (col.key) {
      case "id":
        return (
          <ColumnFilter label="Ticket ID" active={!!ticketId} labelSlot={sortTrigger(col)}>
            <TextInput
              label="Ticket ID"
              placeholder="Ticket ID"
              value={ticketId}
              onChange={setTicketId}
            />
          </ColumnFilter>
        );
      case "username":
        return (
          <ColumnFilter
            label="Username"
            active={!!username || !!userId}
            labelSlot={sortTrigger(col)}
          >
            <div className="space-y-2">
              <TextInput
                label="Username"
                placeholder="Username"
                value={username}
                onChange={setUsername}
              />
              <TextInput
                label="User ID"
                placeholder="User ID"
                value={userId}
                onChange={setUserId}
              />
            </div>
          </ColumnFilter>
        );
      case "rating":
        return (
          <ColumnFilter label="Rating" active={rating !== "0"} labelSlot={sortTrigger(col)}>
            <span className="mb-2 block text-sm font-medium text-white">Rating</span>
            <div className="flex flex-wrap gap-1.5">
              {RATING_OPTIONS.map((opt) => {
                const isActive = rating === opt.key;
                return (
                  <Button
                    key={opt.key}
                    type="button"
                    size="sm"
                    onClick={() => setRating(opt.key)}
                    aria-pressed={isActive}
                    className={`rounded-full border-2 font-medium whitespace-nowrap cursor-pointer ${
                      isActive
                        ? "border-blue-500 bg-blue-500/20"
                        : "border-transparent bg-gray-600/50 opacity-60 hover:opacity-100"
                    }`}
                  >
                    {opt.label}
                  </Button>
                );
              })}
            </div>
          </ColumnFilter>
        );
      case "close_reason":
        return (
          <ColumnFilter label="Close Reason" active={!!closeReason} labelSlot={sortTrigger(col)}>
            <TextInput
              label="Close Reason"
              placeholder="Search close reason..."
              value={closeReason}
              onChange={setCloseReason}
            />
          </ColumnFilter>
        );
      case "labels":
        return labels.length === 0 ? (
          <span>{col.label}</span>
        ) : (
          <ColumnFilter
            label="Labels"
            active={selectedLabelIds.length > 0}
            labelSlot={sortTrigger(col)}
          >
            <div className="flex flex-wrap gap-1.5">
              {labels.map((label) => {
                const isActive = selectedLabelIds.includes(label.label_id);
                const hex = intToColour(label.colour);
                return (
                  <Button
                    key={label.label_id}
                    type="button"
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-opacity cursor-pointer border-2 text-white"
                    style={{
                      backgroundColor: `color-mix(in srgb, ${hex} 20%, transparent)`,
                      opacity: isActive ? 1 : 0.5,
                      borderColor: isActive ? "#3b82f6" : "transparent",
                    }}
                    onClick={() => toggleLabelFilter(label.label_id)}
                    aria-pressed={isActive}
                  >
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: hex }} />
                    {label.name}
                  </Button>
                );
              })}
            </div>
          </ColumnFilter>
        );
    }
  };
  return (
    <MainLayout
      title={`Transcripts for ${selectedGuild?.name || "loading..."}`}
      subtitle="View and manage all transcripts"
    >
      {/* Filters */}
      <div className="bg-gray-800 rounded-xl overflow-hidden mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4">
          <h2 className="text-xl font-medium">Filter transcripts by</h2>
          <div className="flex items-center gap-3 shrink-0">
            {totalCount > 0 && <span className="text-sm text-gray-400">{totalCount} results</span>}
            {isAdmin && (
              <Button variant="secondary" size="sm" onClick={() => setShowLabelManageModal(true)}>
                <FontAwesomeIcon icon={faTag} className="text-xs" />
                Manage Labels
              </Button>
            )}
          </div>
        </div>
        <hr className="text-gray-700" />
        <div className="p-4">
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            <Select
              label="Panel"
              onChange={(value) => setPanel(value ?? "")}
              value={panel}
              options={[
                { key: null, label: "Any Panel" },
                ...panels.map((p) => ({
                  key: p.panel_id.toString(),
                  label: p.title,
                })),
              ]}
            />

            <TextInput
              label="Closed By"
              placeholder="Closed By ID"
              value={closedBy}
              onChange={setClosedBy}
            />

            <TextInput
              label="Claimed By"
              placeholder="Claimed By ID"
              value={claimedBy}
              onChange={setClaimedBy}
            />
          </div>
        </div>
      </div>
      {activeFilters.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {activeFilters.map((f) => (
            <span
              key={f.label}
              className="inline-flex items-center gap-1.5 rounded-full bg-gray-700 px-2.5 py-1 text-xs text-gray-200"
            >
              {f.label}
              <Button
                variant="ghost"
                size="icon"
                onClick={f.clear}
                aria-label={`Clear ${f.label}`}
                className="p-0.5 text-gray-400 hover:text-white"
              >
                <FontAwesomeIcon icon={faXmark} className="text-xs" />
              </Button>
            </span>
          ))}
        </div>
      )}

      {/* Column selector (hidden on mobile where responsive classes handle visibility) */}
      <div className="hidden sm:flex justify-end mb-3">
        <ColumnSelectorButton
          columns={ALL_COLUMNS}
          isOpen={showColumnSelector}
          onToggle={() => setShowColumnSelector(!showColumnSelector)}
          selectedColumns={selectedColumns}
          onToggleColumn={(key: string) => toggleColumn(key as ColumnKey)}
          onClose={() => setShowColumnSelector(false)}
        />
      </div>

      {/* Table */}
      <Table>
        <Table.Head>
          <Table.Row>
            {visibleColumns.map((col) => (
              <Table.HeaderCell
                key={col.key}
                aria-sort={col.sortKey ? ariaSortFor(sort, col.sortKey) : undefined}
                className={`px-3 sm:px-6 py-3 ${col.responsiveClass}`}
              >
                {renderHeader(col)}
              </Table.HeaderCell>
            ))}
            <Table.HeaderCell className="text-right px-3 sm:px-6 py-3">Actions</Table.HeaderCell>
          </Table.Row>
        </Table.Head>
        <Table.Body>
          {loading &&
            Array.from({ length: 6 }).map((_, i) => (
              <Table.Row key={`skeleton-${i}`} className="border-b bg-gray-800 border-gray-700">
                {visibleColumns.map((col) => (
                  <Table.Cell key={col.key} className="px-6 py-4">
                    <Skeleton height={16} />
                  </Table.Cell>
                ))}
                <Table.Cell className="px-6 py-4">
                  <Skeleton width={28} height={16} />
                </Table.Cell>
              </Table.Row>
            ))}
          {!loading && transcripts.length === 0 && (
            <Table.Row className="border-b bg-gray-800 border-gray-700">
              <Table.Cell colSpan={visibleColumns.length + 1} className="p-0">
                <EmptyState
                  icon={faScroll}
                  title="No transcripts found"
                  description="No transcripts match your current filters. Try adjusting your search criteria."
                />
              </Table.Cell>
            </Table.Row>
          )}
          {!loading &&
            transcripts.map((transcript) => {
              const ticketIdContent = transcript.has_transcript ? (
                <Link
                  to={`/manage/${guildId}/transcripts/view/${transcript.ticket_id}`}
                  className="text-inherit hover:underline underline-offset-2 select-text cursor-pointer"
                  onClick={(e) => {
                    if (window.getSelection()?.toString()) {
                      e.preventDefault();
                    }
                  }}
                >
                  {transcript.ticket_id}
                </Link>
              ) : (
                transcript.ticket_id
              );

              return (
                <Table.Row
                  key={transcript.ticket_id}
                  className="text-gray-200 border-b bg-gray-800 border-gray-700 hover:bg-gray-600 h-17.5"
                >
                  {selectedColumns.includes("id") && (
                    <Table.HeaderCell className="px-3 sm:px-6 py-4 font-medium whitespace-nowrap text-white">
                      <span className="block sm:hidden text-xs">{ticketIdContent}</span>
                      <span className="hidden sm:block">{ticketIdContent}</span>
                      {selectedColumns.includes("username") && (
                        <span className="sm:hidden text-xs text-gray-400 mt-1">
                          {transcript.username}
                        </span>
                      )}
                    </Table.HeaderCell>
                  )}
                  {selectedColumns.includes("username") && (
                    <Table.Cell className="px-3 sm:px-6 py-4 hidden sm:table-cell">
                      {transcript.username}
                    </Table.Cell>
                  )}
                  {selectedColumns.includes("rating") && (
                    <Table.Cell className="px-3 sm:px-6 py-4 hidden md:table-cell">
                      {transcript.rating ? `${transcript.rating} \u2B50` : "No rating"}
                    </Table.Cell>
                  )}
                  {selectedColumns.includes("close_reason") && (
                    <Table.Cell className="px-3 sm:px-6 py-4 hidden lg:table-cell">
                      {transcript.close_reason ?? "No reason specified"}
                    </Table.Cell>
                  )}
                  {selectedColumns.includes("labels") && (
                    <Table.Cell className="px-3 sm:px-6 py-4 hidden lg:table-cell">
                      <div className="flex flex-wrap gap-1 items-center">
                        {transcript.labels?.map((label) => (
                          <LabelBadge
                            key={label.label_id}
                            name={label.name}
                            colour={label.colour}
                          />
                        ))}
                        <LabelAssignDropdown
                          labels={labels}
                          assigned={transcript.labels?.map((l) => l.label_id) ?? []}
                          onChange={(ids) => assignLabels(transcript.ticket_id, ids)}
                        />
                      </div>
                    </Table.Cell>
                  )}
                  <Table.Cell className="px-3 sm:px-6 py-4 flex justify-end">
                    <ActionDropdown
                      items={[
                        {
                          label: "View",
                          icon: faEye,
                          href: `/manage/${guildId}/transcripts/view/${transcript.ticket_id}`,
                          hidden: !transcript.has_transcript,
                        },
                        {
                          label: "Edit Close Reason",
                          icon: faPencil,
                          onClick: () => {
                            setEditingTicketId(transcript.ticket_id);
                            setEditReason(transcript.close_reason ?? "");
                          },
                        },
                      ]}
                    />
                  </Table.Cell>
                </Table.Row>
              );
            })}
        </Table.Body>
      </Table>

      {/* Pagination */}
      <Pagination
        variant="full"
        page={page}
        totalPages={totalPages}
        onChange={fetchTranscripts}
        disabled={loading}
      />

      {/* Edit close reason modal */}
      <ActionModal isOpen={editingTicketId !== null} onClose={() => setEditingTicketId(null)}>
        <div className="p-6">
          <h3 className="text-lg font-medium text-white mb-4">Edit Close Reason</h3>
          <Textarea
            value={editReason}
            onChange={setEditReason}
            placeholder="No reason specified"
            max={2000}
          />
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="secondary" onClick={() => setEditingTicketId(null)}>
              Cancel
            </Button>
            <Button variant="success" onClick={saveCloseReason}>
              Save
            </Button>
          </div>
        </div>
      </ActionModal>

      {/* Manage Labels modal */}
      <DismissibleModal
        isOpen={showLabelManageModal}
        onClose={() => {
          setShowLabelManageModal(false);
          setShowLabelEditor(false);
        }}
        className="max-w-md max-h-[80vh] flex flex-col"
        unstyled
      >
        <div className="p-5 pr-12 border-b border-gray-700">
          <h3 className="text-lg font-medium text-white flex items-center gap-2">
            <FontAwesomeIcon icon={faTag} className="text-blue-400" />
            Manage Labels
          </h3>
        </div>

        <div className="p-5 overflow-y-auto flex-1">
          {labels.length === 0 && !showLabelEditor && (
            <p className="text-gray-400 text-sm text-center py-4">No labels created yet.</p>
          )}

          {labels.length > 0 && (
            <div className="space-y-2 mb-4">
              {labels.map((label) => (
                <div
                  key={label.label_id}
                  className="flex items-center justify-between py-2 px-1 border-b border-gray-700 last:border-b-0"
                >
                  <LabelBadge name={label.name} colour={label.colour} />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-red-400/60 hover:text-red-400"
                    onClick={() => deleteLabel(label.label_id)}
                    title={`Delete ${label.name} label`}
                  >
                    <FontAwesomeIcon icon={faTrash} className="text-sm" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Create label form */}
          {showLabelEditor ? (
            <div className="bg-gray-700/50 rounded-lg p-4 space-y-3">
              <TextInput
                label="Label Name"
                placeholder="e.g. Bug, Feature, Urgent"
                value={newLabelName}
                onChange={setNewLabelName}
              />
              <ColourSelect label="Colour" value={newLabelColour} onChange={setNewLabelColour} />

              {/* Preview */}
              <div className="flex items-center gap-2.5 pt-1 min-w-0">
                <span className="text-gray-400 text-[13px] shrink-0">Preview</span>
                <span
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[13px] font-medium leading-none text-white min-w-0"
                  style={{
                    background: `color-mix(in srgb, ${newLabelColour} 20%, transparent)`,
                    border: `1px solid color-mix(in srgb, ${newLabelColour} 40%, transparent)`,
                  }}
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: newLabelColour }}
                  />
                  <span className="truncate">{newLabelName || "Label"}</span>
                </span>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setShowLabelEditor(false);
                    setNewLabelName("");
                    setNewLabelColour("#5865F2");
                  }}
                >
                  Cancel
                </Button>
                <Button variant="primary" onClick={createLabel} disabled={!newLabelName.trim()}>
                  Create
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="dashed"
              className="w-full py-2 rounded-lg hover:border-blue-400/50"
              onClick={() => setShowLabelEditor(true)}
            >
              + Create Label
            </Button>
          )}
        </div>
      </DismissibleModal>
    </MainLayout>
  );
};

export default TranscriptsPage;
