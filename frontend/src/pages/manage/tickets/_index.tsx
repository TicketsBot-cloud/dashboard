import { useCallback, useEffect, useMemo, useRef, useState, type FC } from "react";
import { apiClient } from "@/lib/api";
import {
  useGuildPanels,
  useGuildPremium,
  useGuildTags,
  useGuildTicketLabels,
} from "@/hooks/queries/useGuild";
import { useParams, useLocation, Link, useSearchParams } from "react-router";
import { getGuildById } from "@/stores/auth";
import { usePreferencesStore } from "@/stores/preferences";
import { toast } from "sonner";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBell,
  faCrown,
  faEye,
  faPaperPlane,
  faTag,
  faTicket,
  faTrash,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import ColumnSelectorButton from "@/components/ColumnSelectorButton";
import Button from "@/components/Button";
import Table from "@/components/Table";
import SortableHeaderCell from "@/components/SortableHeaderCell";
import { useTableSort } from "@/hooks/useTableSort";
import { toTime, type SortColumn, type SortDir } from "@/lib/table-sort";
import TextInput from "@/components/TextInput";
import NumberInput from "@/components/NumberInput";
import Select from "@/components/Select";
import Slider from "@/components/Slider";
import Checkbox from "@/components/Checkbox";
import Collapsible from "@/components/Collapsible";
import Textarea from "@/components/Textarea";
import LabelBadge from "@/components/LabelBadge";
import LabelAssignDropdown from "@/components/LabelAssignDropdown";
import ColourSelect from "@/components/ColourSelect";
import ActionModal from "@/components/modal-primitives/ActionModal";
import DismissibleModal from "@/components/modal-primitives/DismissibleModal";
import EmptyState from "@/components/EmptyState";
import { MainLayout } from "@/pages/layout/Main";
import { useGuildStore } from "@/stores/guild";
import Skeleton from "react-loading-skeleton";
import type { Panel, OpenTicket, Tag, TicketLabel } from "@/types";

// --- Helpers ---
function getRelativeTime(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (days > 0) return rtf.format(-days, "day");
  if (hours > 0) return rtf.format(-hours, "hour");
  if (minutes > 0) return rtf.format(-minutes, "minute");
  return rtf.format(-seconds, "second");
}

function intToColour(colour: number): string {
  return `#${colour.toString(16).padStart(6, "0")}`;
}

function colourToInt(hex: string): number {
  return parseInt(hex.replace("#", ""), 16);
}

// --- Types ---

interface ResolvedUser {
  username: string;
  global_name?: string;
}

function displayName(users: Record<string, ResolvedUser>, userId: string): string {
  const user = users[userId];
  if (!user) return "Unknown";
  return user.global_name || user.username;
}

function panelTitle(titles: Record<string, string>, panelId: number | null): string {
  if (panelId == null) return "None";
  return titles[String(panelId)] || "Unknown Panel";
}

// Triage order, not a column sort: direction-independent by design.
function compareUnclaimed(a: OpenTicket, b: OpenTicket, selfId: string): number {
  const aIsMine = !a.claimed_by || a.claimed_by === selfId;
  const bIsMine = !b.claimed_by || b.claimed_by === selfId;
  if (aIsMine !== bIsMine) return aIsMine ? -1 : 1;

  const aAwaiting = a.last_response_is_staff === false;
  const bAwaiting = b.last_response_is_staff === false;
  if (aAwaiting !== bAwaiting) return aAwaiting ? -1 : 1;

  return (toTime(a.last_response_time) ?? 0) - (toTime(b.last_response_time) ?? 0);
}

type ColumnKey =
  | "id"
  | "panel"
  | "user"
  | "opened"
  | "claimed_by"
  | "last_message"
  | "awaiting_response"
  | "labels";

type TicketSortKey = Exclude<ColumnKey, "labels"> | "unclaimed";

interface ColumnDef {
  key: ColumnKey;
  label: string;
  responsiveClass: string;
  sortKey?: TicketSortKey;
}

const ALL_COLUMNS: ColumnDef[] = [
  { key: "id", label: "ID", responsiveClass: "", sortKey: "id" },
  { key: "panel", label: "Panel", responsiveClass: "hidden sm:table-cell", sortKey: "panel" },
  { key: "user", label: "User", responsiveClass: "hidden sm:table-cell", sortKey: "user" },
  { key: "opened", label: "Opened", responsiveClass: "hidden lg:table-cell", sortKey: "opened" },
  {
    key: "claimed_by",
    label: "Claimed By",
    responsiveClass: "hidden md:table-cell",
    sortKey: "claimed_by",
  },
  {
    key: "last_message",
    label: "Last Message",
    responsiveClass: "hidden lg:table-cell",
    sortKey: "last_message",
  },
  {
    key: "awaiting_response",
    label: "Awaiting Response",
    responsiveClass: "hidden lg:table-cell",
    sortKey: "awaiting_response",
  },
  { key: "labels", label: "Labels", responsiveClass: "hidden md:table-cell" },
];

// `?sort=id_asc` predates the sort/dir split; map it once so existing links keep working.
const LEGACY_SORT: Record<string, { key: TicketSortKey; dir: SortDir }> = {
  id_asc: { key: "id", dir: "asc" },
  id_desc: { key: "id", dir: "desc" },
  unclaimed: { key: "unclaimed", dir: "asc" },
};

const DEFAULT_COLUMNS: ColumnKey[] = [
  "id",
  "panel",
  "user",
  "claimed_by",
  "last_message",
  "awaiting_response",
  "labels",
];

// --- Component ---

const TicketsPage: FC = () => {
  const location = useLocation();
  let { guildId } = useParams();
  guildId = guildId!;

  const { selectGuild, selectedGuild } = useGuildStore();
  const isAdmin = getGuildById(guildId)?.permission_level === 2;

  const { data: cachedPanels = [] } = useGuildPanels(guildId);
  const { data: cachedLabels = [] } = useGuildTicketLabels(guildId);
  const { data: cachedTags = {} } = useGuildTags(guildId);
  const { data: premiumState } = useGuildPremium(guildId);
  const isPremium = !!premiumState?.premium;

  useEffect(() => {
    const guild = getGuildById(guildId);
    if (guild) {
      if (!selectedGuild || selectedGuild.id !== guild.id) {
        selectGuild(guild);
      }
    }
  }, [guildId, selectGuild, selectedGuild]);

  // --- Data state ---
  const [tickets, setTickets] = useState<OpenTicket[]>([]);
  const [panelTitles, setPanelTitles] = useState<Record<string, string>>({});
  const [resolvedUsers, setResolvedUsers] = useState<Record<string, ResolvedUser>>({});
  const [ticketLabels, setTicketLabels] = useState<Record<string, TicketLabel[]>>({});
  const [selfId, setSelfId] = useState<string>("");
  const [loading, setLoading] = useState(true);

  // Panels and labels for filters/management
  const [panels, setPanels] = useState<Panel[]>([]);
  const [labels, setLabels] = useState<TicketLabel[]>([]);
  const [tags, setTags] = useState<Record<string, Tag>>({});

  const [searchParams, setSearchParams] = useSearchParams();

  // --- Filter state ---
  const [ticketId, setTicketId] = useState(() => searchParams.get("ticket_id") ?? "");
  const [username, setUsername] = useState(() => searchParams.get("username") ?? "");
  const [userId, setUserId] = useState(() => searchParams.get("user_id") ?? "");
  const [claimedById, setClaimedById] = useState(() => searchParams.get("claimed_by") ?? "");
  const [panel, setPanel] = useState<string | null>(() => searchParams.get("panel") ?? "");
  const [selectedLabelIds, setSelectedLabelIds] = useState<number[]>(() => {
    const labelsParam = searchParams.get("labels");
    if (!labelsParam) return [];
    return labelsParam
      .split(",")
      .map(Number)
      .filter((n) => !isNaN(n) && n > 0);
  });

  // --- Client-side controls ---
  const [onlyMyTickets, setOnlyMyTickets] = useState(() => searchParams.get("mine") === "1");
  const { tickets: ticketPrefs, setTicketPrefs } = usePreferencesStore();
  const selectedColumns = (
    ticketPrefs.columns.length > 0 ? ticketPrefs.columns : DEFAULT_COLUMNS
  ) as string[];
  const [showColumnSelector, setShowColumnSelector] = useState(false);

  // --- Selection ---
  const [selectedTicketIds, setSelectedTicketIds] = useState<Set<number>>(new Set());

  const toggleTicketSelection = useCallback((ticketId: number) => {
    setSelectedTicketIds((prev) => {
      const next = new Set(prev);
      if (next.has(ticketId)) next.delete(ticketId);
      else next.add(ticketId);
      return next;
    });
  }, []);

  // --- Label management ---
  const [showLabelManageModal, setShowLabelManageModal] = useState(false);
  const [showLabelEditor, setShowLabelEditor] = useState(false);
  const [newLabelName, setNewLabelName] = useState("");
  const [newLabelColour, setNewLabelColour] = useState("#5865F2");

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
        if (claimedById) next.set("claimed_by", claimedById);
        else next.delete("claimed_by");
        if (panel) next.set("panel", panel);
        else next.delete("panel");
        if (selectedLabelIds.length > 0) next.set("labels", selectedLabelIds.join(","));
        else next.delete("labels");
        if (onlyMyTickets) next.set("mine", "1");
        else next.delete("mine");
        return next;
      },
      { replace: true },
    );
  }, [
    ticketId,
    username,
    userId,
    claimedById,
    panel,
    selectedLabelIds,
    onlyMyTickets,
    setSearchParams,
  ]);

  // --- Mutually exclusive text filters ---
  const handleTicketIdChange = useCallback((value: string) => {
    setTicketId(value);
    if (value) {
      setUsername("");
      setUserId("");
    }
  }, []);

  const handleUsernameChange = useCallback((value: string) => {
    setUsername(value);
    if (value) {
      setTicketId("");
      setUserId("");
    }
  }, []);

  const handleUserIdChange = useCallback((value: string) => {
    setUserId(value);
    if (value) {
      setTicketId("");
      setUsername("");
    }
  }, []);

  // --- API calls ---

  const buildRequestBody = useCallback(
    () => ({
      id: ticketId || null,
      username: username || null,
      user_id: userId || null,
      claimed_by_id: claimedById || null,
      panel_id: panel ? Number(panel) : null,
      label_ids: selectedLabelIds.length > 0 ? selectedLabelIds : null,
    }),
    [ticketId, username, userId, claimedById, panel, selectedLabelIds],
  );

  const closedTicketId = (location.state as { closedTicketId?: number } | null)?.closedTicketId;
  const excludeClosedTicketRef = useRef(closedTicketId);
  const loadedFilterKeyRef = useRef<string | null>(null);

  useEffect(() => {
    loadedFilterKeyRef.current = null;
  }, [guildId]);

  const filterKey = useMemo(
    () =>
      JSON.stringify({
        guildId,
        ticketId,
        username,
        userId,
        claimedById,
        panel,
        selectedLabelIds,
      }),
    [guildId, ticketId, username, userId, claimedById, panel, selectedLabelIds],
  );

  // Load on mount and when filters change (debounced). A single effect avoids the old
  // mount + filter effects both calling the list API; cleanup ignores stale runs (Strict Mode).
  useEffect(() => {
    let ignore = false;
    const isFilterChange =
      loadedFilterKeyRef.current !== null && loadedFilterKeyRef.current !== filterKey;
    const delay = isFilterChange ? 500 : 0;

    const timer = window.setTimeout(async () => {
      try {
        setLoading(true);
        const response = await apiClient.tickets.list(guildId, buildRequestBody());
        if (ignore) return;

        const data = response.data;
        // Go serialises nil *uint64 with ,string tag as "null" - normalise to undefined
        let normalisedTickets = (data.tickets ?? []).map((t) => ({
          ...t,
          claimed_by: t.claimed_by === "null" ? null : t.claimed_by,
        }));

        const excludeId = excludeClosedTicketRef.current;
        if (excludeId != null) {
          excludeClosedTicketRef.current = undefined;
          normalisedTickets = normalisedTickets.filter((t) => t.id !== excludeId);
        }

        setTickets(normalisedTickets);
        setPanelTitles(data.panel_titles ?? {});
        setResolvedUsers(data.resolved_users ?? {});
        setTicketLabels(data.labels ?? {});
        setSelfId(data.self_id ?? "");
        loadedFilterKeyRef.current = filterKey;
      } catch (error) {
        if (!ignore) {
          console.error("Failed to fetch tickets:", error);
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }, delay);

    return () => {
      ignore = true;
      window.clearTimeout(timer);
    };
  }, [filterKey, guildId, buildRequestBody]);

  useEffect(() => {
    setPanels(cachedPanels);
  }, [cachedPanels]);

  useEffect(() => {
    setLabels(cachedLabels);
  }, [cachedLabels]);

  useEffect(() => {
    setTags(cachedTags);
  }, [cachedTags]);

  // --- Client-side filtering and sorting ---

  const filteredTickets = useMemo(
    () =>
      onlyMyTickets && selfId
        ? tickets.filter((t) => !t.claimed_by || t.claimed_by === selfId)
        : tickets,
    [tickets, onlyMyTickets, selfId],
  );

  const sortColumns = useMemo<Record<TicketSortKey, SortColumn<OpenTicket>>>(
    () => ({
      id: { value: (t) => t.id },
      panel: { value: (t) => panelTitle(panelTitles, t.panel_id), defaultDir: "asc" },
      user: { value: (t) => displayName(resolvedUsers, t.user_id), defaultDir: "asc" },
      opened: { value: (t) => toTime(t.opened_at) },
      claimed_by: {
        value: (t) => (t.claimed_by ? displayName(resolvedUsers, t.claimed_by) : null),
        defaultDir: "asc",
      },
      last_message: { value: (t) => toTime(t.last_response_time) },
      awaiting_response: { value: (t) => t.last_response_is_staff === false },
      unclaimed: { compare: (a, b) => compareUnclaimed(a, b, selfId), defaultDir: "asc" },
    }),
    [panelTitles, resolvedUsers, selfId],
  );

  const sort = useTableSort(filteredTickets, sortColumns, {
    initialSort: LEGACY_SORT[searchParams.get("sort") ?? ""] ?? { key: "unclaimed", dir: "asc" },
    syncToUrl: true,
    persistKey: "tickets",
  });

  const processedTickets = sort.sortedRows;

  const processedTicketIds = useMemo(
    () => new Set(processedTickets.map((ticket) => ticket.id)),
    [processedTickets],
  );

  // --- Selection (depends on processedTickets) ---
  const toggleSelectAll = useCallback(() => {
    setSelectedTicketIds((prev) => {
      if (prev.size === processedTickets.length && processedTickets.length > 0) return new Set();
      return new Set(processedTickets.map((t) => t.id));
    });
  }, [processedTickets]);

  const clearSelection = useCallback(() => setSelectedTicketIds(new Set()), []);

  // Keep bulk actions scoped to the rows currently visible after client-side filters.
  useEffect(() => {
    setSelectedTicketIds((prev) => {
      const next = new Set([...prev].filter((id) => processedTicketIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [processedTicketIds]);

  // --- Bulk actions ---
  const [showBulkCloseModal, setShowBulkCloseModal] = useState(false);
  const [bulkCloseReason, setBulkCloseReason] = useState("");
  const [bulkClosing, setBulkClosing] = useState(false);

  const bulkCloseTickets = useCallback(async () => {
    if (bulkClosing || selectedTicketIds.size === 0) return;
    setBulkClosing(true);
    const ids = Array.from(selectedTicketIds);
    setBulkCloseReason("");
    setShowBulkCloseModal(false);
    const toastId = toast.loading(`Closing ${ids.length} ticket${ids.length !== 1 ? "s" : ""}…`);
    try {
      const response = await apiClient.tickets.bulkClose(guildId, ids, bulkCloseReason.trim());
      const { closed, failed, background_count } = response.data;
      setTickets((prev) => prev.filter((t) => !closed.includes(t.id)));
      clearSelection();
      const bgNote = background_count
        ? ` ${background_count} more still processing in the background.`
        : "";
      if (Object.keys(failed).length > 0) {
        toast.warning(
          `Closed ${closed.length} ticket${closed.length !== 1 ? "s" : ""}. ${Object.keys(failed).length} failed.${bgNote}`,
          { id: toastId },
        );
      } else if (background_count) {
        toast.success(`Closed ${closed.length} ticket${closed.length !== 1 ? "s" : ""}.${bgNote}`, {
          id: toastId,
        });
      } else {
        toast.success(`Closed ${closed.length} ticket${closed.length !== 1 ? "s" : ""}`, {
          id: toastId,
        });
      }
    } catch (error) {
      console.error("Failed to bulk close tickets:", error);
      toast.error("Failed to close tickets", { id: toastId });
    } finally {
      setBulkClosing(false);
    }
  }, [bulkClosing, selectedTicketIds, guildId, bulkCloseReason, clearSelection]);

  const [showBulkSendModal, setShowBulkSendModal] = useState(false);
  const [bulkSending, setBulkSending] = useState(false);
  const [bulkMessageContent, setBulkMessageContent] = useState("");

  const bulkSendMessage = useCallback(async () => {
    if (bulkSending || selectedTicketIds.size === 0 || !bulkMessageContent.trim()) return;
    setBulkSending(true);
    const ids = Array.from(selectedTicketIds);
    setBulkMessageContent("");
    setShowBulkSendModal(false);
    const toastId = toast.loading(
      `Sending message to ${ids.length} ticket${ids.length !== 1 ? "s" : ""}…`,
    );
    try {
      const response = await apiClient.tickets.bulkSendMessage(
        guildId,
        ids,
        bulkMessageContent.trim(),
      );
      const { sent, failed, background_count } = response.data;
      const bgNote = background_count
        ? ` ${background_count} more still processing in the background.`
        : "";
      if (Object.keys(failed).length > 0) {
        toast.warning(
          `Sent to ${sent.length} ticket${sent.length !== 1 ? "s" : ""}. ${Object.keys(failed).length} failed.${bgNote}`,
          { id: toastId },
        );
      } else if (background_count) {
        toast.success(`Sent to ${sent.length} ticket${sent.length !== 1 ? "s" : ""}.${bgNote}`, {
          id: toastId,
        });
      } else {
        toast.success(`Message sent to ${sent.length} ticket${sent.length !== 1 ? "s" : ""}`, {
          id: toastId,
        });
      }
    } catch (error) {
      console.error("Failed to bulk send message:", error);
      toast.error("Failed to send message", { id: toastId });
    } finally {
      setBulkSending(false);
    }
  }, [bulkSending, selectedTicketIds, guildId, bulkMessageContent]);

  const [showBulkCloseRequestModal, setShowBulkCloseRequestModal] = useState(false);
  const [bulkCloseRequestReason, setBulkCloseRequestReason] = useState("");
  const [bulkCloseRequestDelay, setBulkCloseRequestDelay] = useState(0);
  const [bulkSendingCloseRequest, setBulkSendingCloseRequest] = useState(false);

  const bulkSendCloseRequest = useCallback(async () => {
    if (bulkSendingCloseRequest || selectedTicketIds.size === 0) return;
    setBulkSendingCloseRequest(true);
    const ids = Array.from(selectedTicketIds);
    const reason = bulkCloseRequestReason.trim() || undefined;
    const delay = bulkCloseRequestDelay > 0 ? bulkCloseRequestDelay : undefined;
    setBulkCloseRequestReason("");
    setBulkCloseRequestDelay(0);
    setShowBulkCloseRequestModal(false);
    const toastId = toast.loading(
      `Sending close request to ${ids.length} ticket${ids.length !== 1 ? "s" : ""}…`,
    );
    try {
      const response = await apiClient.tickets.bulkCloseRequest(guildId, ids, reason, delay);
      const { sent, failed, background_count } = response.data;
      const bgNote = background_count
        ? ` ${background_count} more still processing in the background.`
        : "";
      if (Object.keys(failed).length > 0) {
        toast.warning(
          `Sent to ${sent.length} ticket${sent.length !== 1 ? "s" : ""}. ${Object.keys(failed).length} failed.${bgNote}`,
          { id: toastId },
        );
      } else if (background_count) {
        toast.success(
          `Close request sent to ${sent.length} ticket${sent.length !== 1 ? "s" : ""}.${bgNote}`,
          { id: toastId },
        );
      } else {
        toast.success(
          `Close request sent to ${sent.length} ticket${sent.length !== 1 ? "s" : ""}`,
          { id: toastId },
        );
      }
    } catch (error) {
      console.error("Failed to bulk send close request:", error);
      toast.error("Failed to send close requests", { id: toastId });
    } finally {
      setBulkSendingCloseRequest(false);
    }
  }, [
    bulkSendingCloseRequest,
    selectedTicketIds,
    guildId,
    bulkCloseRequestReason,
    bulkCloseRequestDelay,
  ]);

  const [showBulkSendTagModal, setShowBulkSendTagModal] = useState(false);
  const [bulkSendingTag, setBulkSendingTag] = useState(false);
  const [selectedTagId, setSelectedTagId] = useState("");

  const bulkSendTag = useCallback(async () => {
    if (bulkSendingTag || selectedTicketIds.size === 0 || !selectedTagId) return;
    setBulkSendingTag(true);
    const ids = Array.from(selectedTicketIds);
    setSelectedTagId("");
    setShowBulkSendTagModal(false);
    const toastId = toast.loading(
      `Sending tag to ${ids.length} ticket${ids.length !== 1 ? "s" : ""}…`,
    );
    try {
      const response = await apiClient.tickets.bulkSendTag(guildId, ids, selectedTagId);
      const { sent, failed, background_count } = response.data;
      const bgNote = background_count
        ? ` ${background_count} more still processing in the background.`
        : "";
      if (Object.keys(failed).length > 0) {
        toast.warning(
          `Sent to ${sent.length} ticket${sent.length !== 1 ? "s" : ""}. ${Object.keys(failed).length} failed.${bgNote}`,
          { id: toastId },
        );
      } else if (background_count) {
        toast.success(
          `Tag sent to ${sent.length} ticket${sent.length !== 1 ? "s" : ""}.${bgNote}`,
          { id: toastId },
        );
      } else {
        toast.success(`Tag sent to ${sent.length} ticket${sent.length !== 1 ? "s" : ""}`, {
          id: toastId,
        });
      }
    } catch (error) {
      console.error("Failed to bulk send tag:", error);
      toast.error("Failed to send tag", { id: toastId });
    } finally {
      setBulkSendingTag(false);
    }
  }, [bulkSendingTag, selectedTicketIds, guildId, selectedTagId]);

  // --- Label filter toggle ---
  const toggleLabelFilter = (labelId: number) => {
    setSelectedLabelIds((prev) =>
      prev.includes(labelId) ? prev.filter((id) => id !== labelId) : [...prev, labelId],
    );
  };

  // --- Label CRUD ---
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

  // --- Label assignment ---
  const assignLabels = async (ticketIdToAssign: number, labelIds: number[]) => {
    try {
      await apiClient.tickets.assignLabels(guildId, ticketIdToAssign, labelIds);
      setTicketLabels((prev) => ({
        ...prev,
        [String(ticketIdToAssign)]: labels.filter((l) => labelIds.includes(l.label_id)),
      }));
      toast.success("Labels updated");
    } catch (error) {
      console.error("Failed to assign labels:", error);
    }
  };

  // --- Column visibility ---
  const visibleColumns = useMemo(
    () => ALL_COLUMNS.filter((col) => selectedColumns.includes(col.key)),
    [selectedColumns],
  );

  // Responsive classes hide columns independently of the selector, so never clear the sort here.
  const hiddenSortLabel = useMemo(() => {
    if (sort.sortKey === "unclaimed") return null;
    if (visibleColumns.some((col) => col.sortKey === sort.sortKey)) return null;
    return ALL_COLUMNS.find((col) => col.sortKey === sort.sortKey)?.label ?? null;
  }, [sort.sortKey, visibleColumns]);

  const toggleColumn = (key: ColumnKey) => {
    if (selectedColumns.includes(key)) {
      if (selectedColumns.length <= 1) return;
      setTicketPrefs({ columns: selectedColumns.filter((k) => k !== key) });
    } else {
      setTicketPrefs({ columns: [...selectedColumns, key] });
    }
  };

  // --- Helpers for rendering ---
  const getDisplayName = (userId: string): string => displayName(resolvedUsers, userId);

  const getPanelTitle = (panelId: number | null): string => panelTitle(panelTitles, panelId);

  const getLabelsForTicket = (ticketId: number): TicketLabel[] => {
    return ticketLabels[String(ticketId)] ?? [];
  };

  return (
    <MainLayout
      title={`Open Tickets for ${selectedGuild?.name || "loading..."}`}
      subtitle="View and manage all open tickets"
    >
      {/* Filter Card */}
      <div className="bg-gray-800 rounded-xl overflow-hidden mb-8">
        <div className="flex items-center justify-between p-4">
          <h2 className="text-xl font-medium">Filter tickets by</h2>
          <div className="flex items-center gap-3">
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
          <div className="mb-4">
            <Select
              label="Panel"
              onChange={(value) => setPanel(value)}
              value={panel}
              options={[
                { key: null, label: "Any Panel" },
                ...panels.map((p) => ({
                  key: p.panel_id.toString(),
                  label: p.title,
                })),
              ]}
            />
          </div>

          {/* Text filters */}
          <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
            <TextInput
              label="Ticket ID"
              placeholder="Ticket ID"
              value={ticketId}
              onChange={handleTicketIdChange}
            />
            <TextInput
              label="Username"
              placeholder="Username"
              value={username}
              onChange={handleUsernameChange}
            />
            <TextInput
              label="User ID"
              placeholder="User ID"
              value={userId}
              onChange={handleUserIdChange}
            />
            <TextInput
              label="Claimed By ID"
              placeholder="Claimed By ID"
              value={claimedById}
              onChange={setClaimedById}
            />

            <Slider
              value={onlyMyTickets}
              onChange={setOnlyMyTickets}
              label="Only Show Unclaimed & My Tickets"
              className="md:col-span-2 lg:col-span-4"
            />

            <Slider
              value={sort.sortKey === "unclaimed"}
              onChange={(on) => sort.setSort(on ? "unclaimed" : "last_message", "asc")}
              label="Unclaimed & Awaiting Response First"
              className="md:col-span-2 lg:col-span-4"
            />
          </div>

          {/* Label filter pills */}
          {labels.length > 0 && (
            <div className="mt-4">
              <span className="mb-2 block text-white text-sm">Labels</span>
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
            </div>
          )}
        </div>
      </div>

      {/* Column selector (hidden on mobile where responsive classes handle visibility) */}
      <div className="hidden sm:flex justify-end items-center gap-3 mb-3">
        {hiddenSortLabel && (
          <span className="text-sm text-gray-400">
            Sorted by {hiddenSortLabel} {sort.sortDir === "asc" ? "↑" : "↓"}
          </span>
        )}
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
            <Table.HeaderCell className="px-3 sm:px-4 py-3 w-10">
              <Checkbox
                checked={
                  processedTickets.length > 0 && selectedTicketIds.size === processedTickets.length
                }
                indeterminate={
                  selectedTicketIds.size > 0 && selectedTicketIds.size < processedTickets.length
                }
                onChange={toggleSelectAll}
                ariaLabel="Select all tickets"
                disabled={loading}
              />
            </Table.HeaderCell>
            {visibleColumns.map((col) =>
              col.sortKey ? (
                <SortableHeaderCell
                  key={col.key}
                  sort={sort}
                  sortKey={col.sortKey}
                  label={col.label}
                  className={col.responsiveClass}
                />
              ) : (
                <Table.HeaderCell
                  key={col.key}
                  className={`px-3 sm:px-6 py-3 ${col.responsiveClass}`}
                >
                  {col.label}
                </Table.HeaderCell>
              ),
            )}
            <Table.HeaderCell className="text-right px-3 sm:px-6 py-3">Actions</Table.HeaderCell>
          </Table.Row>
        </Table.Head>
        <Table.Body>
          {loading &&
            Array.from({ length: 6 }).map((_, i) => (
              <Table.Row key={`skeleton-${i}`} className="border-b bg-gray-800 border-gray-700">
                <Table.Cell className="px-3 sm:px-4 py-4 w-10">
                  <Skeleton width={16} height={16} />
                </Table.Cell>
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
          {!loading && processedTickets.length === 0 && (
            <Table.Row className="border-b bg-gray-800 border-gray-700">
              <Table.Cell colSpan={visibleColumns.length + 2} className="p-0">
                <EmptyState
                  icon={faTicket}
                  title="No open tickets"
                  description="Your queue is clear! No tickets match the current filters."
                />
              </Table.Cell>
            </Table.Row>
          )}
          {!loading &&
            processedTickets.map((ticket) => {
              const assignedLabels = getLabelsForTicket(ticket.id);
              const isSelected = selectedTicketIds.has(ticket.id);
              return (
                <Table.Row
                  key={ticket.id}
                  className={`text-gray-200 border-b border-gray-700 h-17.5 transition-colors ${isSelected ? "bg-blue-900/30 hover:bg-blue-900/40" : "bg-gray-800 hover:bg-gray-600"}`}
                >
                  <Table.Cell className="px-3 sm:px-4 py-4 w-10">
                    <Checkbox
                      checked={isSelected}
                      onChange={() => toggleTicketSelection(ticket.id)}
                      ariaLabel={`Select ticket ${ticket.id}`}
                    />
                  </Table.Cell>
                  {selectedColumns.includes("id") && (
                    <Table.RowHeaderCell className="px-3 sm:px-6 py-4 font-medium whitespace-nowrap text-white">
                      {ticket.id}
                    </Table.RowHeaderCell>
                  )}
                  {selectedColumns.includes("panel") && (
                    <Table.Cell className="px-3 sm:px-6 py-4 hidden sm:table-cell">
                      {getPanelTitle(ticket.panel_id)}
                    </Table.Cell>
                  )}
                  {selectedColumns.includes("user") && (
                    <Table.Cell className="px-3 sm:px-6 py-4 hidden sm:table-cell">
                      {getDisplayName(ticket.user_id)}
                    </Table.Cell>
                  )}
                  {selectedColumns.includes("opened") && (
                    <Table.Cell className="px-3 sm:px-6 py-4 hidden lg:table-cell">
                      {ticket.opened_at ? getRelativeTime(new Date(ticket.opened_at)) : "Unknown"}
                    </Table.Cell>
                  )}
                  {selectedColumns.includes("claimed_by") && (
                    <Table.Cell className="px-3 sm:px-6 py-4 hidden md:table-cell">
                      {ticket.claimed_by ? (
                        getDisplayName(ticket.claimed_by)
                      ) : (
                        <span className="font-bold">Unclaimed</span>
                      )}
                    </Table.Cell>
                  )}
                  {selectedColumns.includes("last_message") && (
                    <Table.Cell className="px-3 sm:px-6 py-4 hidden lg:table-cell">
                      {ticket.last_response_time
                        ? getRelativeTime(new Date(ticket.last_response_time))
                        : "Never"}
                    </Table.Cell>
                  )}
                  {selectedColumns.includes("awaiting_response") && (
                    <Table.Cell className="px-3 sm:px-6 py-4 hidden lg:table-cell">
                      {ticket.last_response_is_staff === false ? (
                        <span className="font-bold">Yes</span>
                      ) : (
                        "No"
                      )}
                    </Table.Cell>
                  )}
                  {selectedColumns.includes("labels") && (
                    <Table.Cell className="px-3 sm:px-6 py-4 hidden md:table-cell">
                      <div className="flex flex-wrap gap-1 items-center">
                        {assignedLabels.map((label) => (
                          <LabelBadge
                            key={label.label_id}
                            name={label.name}
                            colour={label.colour}
                          />
                        ))}
                        <LabelAssignDropdown
                          labels={labels}
                          assigned={assignedLabels.map((l) => l.label_id)}
                          onChange={(ids) => assignLabels(ticket.id, ids)}
                        />
                      </div>
                    </Table.Cell>
                  )}
                  <Table.Cell className="px-3 sm:px-6 py-4 flex justify-end">
                    <Link
                      to={`/manage/${guildId}/tickets/view/${ticket.id}`}
                      className="flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors cursor-pointer"
                    >
                      <FontAwesomeIcon icon={faEye} className="text-xs" />
                      View
                    </Link>
                  </Table.Cell>
                </Table.Row>
              );
            })}
        </Table.Body>
      </Table>

      {/* Bulk actions */}
      {selectedTicketIds.size > 0 && (
        <div className="mt-6">
          <Collapsible
            title="Bulk Actions"
            subtitle={`${selectedTicketIds.size} ticket${selectedTicketIds.size !== 1 ? "s" : ""} selected`}
            defaultOpen={false}
          >
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                size="sm"
                visuallyDisabled={!isPremium}
                title={
                  isPremium
                    ? undefined
                    : "Message tickets directly from the dashboard. Requires Premium."
                }
                onClick={() => setShowBulkSendModal(true)}
              >
                <FontAwesomeIcon icon={faPaperPlane} className="text-xs" />
                Send Message
                {!isPremium && (
                  <FontAwesomeIcon icon={faCrown} className="text-amber-400 text-xs" />
                )}
              </Button>
              {Object.keys(tags).length > 0 && (
                <Button
                  variant="secondary"
                  size="sm"
                  visuallyDisabled={!isPremium}
                  title={
                    isPremium
                      ? undefined
                      : "Send a canned tag reply to multiple tickets at once. Requires Premium."
                  }
                  onClick={() => setShowBulkSendTagModal(true)}
                >
                  <FontAwesomeIcon icon={faTag} className="text-xs" />
                  Send Tag
                  {!isPremium && (
                    <FontAwesomeIcon icon={faCrown} className="text-amber-400 text-xs" />
                  )}
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                className="bg-yellow-600/20 hover:bg-yellow-600/30 text-yellow-400 hover:text-yellow-300 border-transparent hover:border-transparent"
                onClick={() => setShowBulkCloseRequestModal(true)}
              >
                <FontAwesomeIcon icon={faBell} className="text-xs" />
                Send Close Request
              </Button>
              <Button
                variant="danger"
                size="sm"
                className="bg-red-600/20 hover:bg-red-600/30 text-red-400 hover:text-red-300"
                onClick={() => setShowBulkCloseModal(true)}
              >
                <FontAwesomeIcon icon={faXmark} className="text-xs" />
                Close tickets
              </Button>
            </div>
          </Collapsible>
        </div>
      )}

      {/* Bulk close modal */}
      <ActionModal
        isOpen={showBulkCloseModal}
        onClose={() => {
          setShowBulkCloseModal(false);
          setBulkCloseReason("");
        }}
        className="max-w-md"
      >
        <div className="p-5 border-b border-gray-700">
          <h3 className="text-lg font-medium text-white">
            Close {selectedTicketIds.size} Ticket{selectedTicketIds.size !== 1 ? "s" : ""}
          </h3>
        </div>
        <div className="p-5 flex flex-col gap-4">
          <TextInput
            label="Close reason (optional)"
            value={bulkCloseReason}
            onChange={(v) => setBulkCloseReason(v)}
            placeholder="Enter a reason..."
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setShowBulkCloseModal(false);
                setBulkCloseReason("");
              }}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={bulkCloseTickets}
              disabled={bulkClosing}
              isLoading={bulkClosing}
            >
              Close tickets
            </Button>
          </div>
        </div>
      </ActionModal>

      {/* Bulk send tag modal */}
      <ActionModal
        isOpen={showBulkSendTagModal}
        onClose={() => {
          setShowBulkSendTagModal(false);
          setSelectedTagId("");
        }}
        className="max-w-md"
      >
        <div className="p-5 border-b border-gray-700">
          <h3 className="text-lg font-medium text-white">
            Send Tag to {selectedTicketIds.size} Ticket{selectedTicketIds.size !== 1 ? "s" : ""}
          </h3>
        </div>
        <div className="p-5 flex flex-col gap-4">
          <Select
            label="Tag"
            value={selectedTagId}
            onChange={(v) => setSelectedTagId(v ?? "")}
            placeholder="Select a tag..."
            options={Object.entries(tags).map(([id, tag]) => ({ key: id, label: tag.id }))}
            hideSearch={Object.keys(tags).length <= 5}
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setShowBulkSendTagModal(false);
                setSelectedTagId("");
              }}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={bulkSendTag}
              disabled={bulkSendingTag || !selectedTagId}
              isLoading={bulkSendingTag}
            >
              Send
            </Button>
          </div>
        </div>
      </ActionModal>

      {/* Bulk send message modal */}
      <ActionModal
        isOpen={showBulkSendModal}
        onClose={() => {
          setShowBulkSendModal(false);
          setBulkMessageContent("");
        }}
        className="max-w-lg"
      >
        <div className="p-5 border-b border-gray-700">
          <h3 className="text-lg font-medium text-white">
            Send Message to {selectedTicketIds.size} Ticket{selectedTicketIds.size !== 1 ? "s" : ""}
          </h3>
        </div>
        <div className="p-5 flex flex-col gap-4">
          <Textarea
            label="Message"
            placeholder="Message to send to all selected tickets..."
            value={bulkMessageContent}
            onChange={setBulkMessageContent}
            max={2000}
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setShowBulkSendModal(false);
                setBulkMessageContent("");
              }}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={bulkSendMessage}
              disabled={bulkSending || !bulkMessageContent.trim()}
              isLoading={bulkSending}
            >
              Send
            </Button>
          </div>
        </div>
      </ActionModal>

      {/* Bulk close request modal */}
      <ActionModal
        isOpen={showBulkCloseRequestModal}
        onClose={() => {
          setShowBulkCloseRequestModal(false);
          setBulkCloseRequestReason("");
          setBulkCloseRequestDelay(0);
        }}
        className="max-w-md"
      >
        <div className="p-5 border-b border-gray-700">
          <h3 className="text-lg font-medium text-white">
            Send Close Request to {selectedTicketIds.size} Ticket
            {selectedTicketIds.size !== 1 ? "s" : ""}
          </h3>
        </div>
        <div className="p-5 flex flex-col gap-4">
          <TextInput
            label="Reason (optional)"
            value={bulkCloseRequestReason}
            onChange={(v) => setBulkCloseRequestReason(v)}
            placeholder="Reason (optional)"
          />
          <NumberInput
            label="Auto-close delay (hours)"
            value={bulkCloseRequestDelay}
            onChange={setBulkCloseRequestDelay}
            min={0}
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setShowBulkCloseRequestModal(false);
                setBulkCloseRequestReason("");
                setBulkCloseRequestDelay(0);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              className="bg-yellow-600 hover:bg-yellow-500"
              onClick={bulkSendCloseRequest}
              disabled={bulkSendingCloseRequest}
              isLoading={bulkSendingCloseRequest}
            >
              Send Requests
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

export default TicketsPage;
