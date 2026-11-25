import { useCallback, useEffect, useId, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useSearchParams } from "react-router";
import type { AxiosError, AxiosRequestConfig } from "axios";
import { toast } from "sonner";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faExclamationTriangle,
  faFileExport,
  faServer,
  faTrash,
  faUserSecret,
  faUserShield,
} from "@fortawesome/free-solid-svg-icons";
import { MainLayout } from "@/pages/layout/Main";
import Button from "@/components/Button";
import Checkbox from "@/components/Checkbox";
import EmptyState from "@/components/EmptyState";
import MultiSelect from "@/components/MultiSelect";
import RequiredMark from "@/components/RequiredMark";
import Select from "@/components/Select";
import Table from "@/components/Table";
import TextInput from "@/components/TextInput";
import ActionModal from "@/components/modal-primitives/ActionModal";
import { FOCUSABLE_SELECTOR } from "@/components/modal-primitives/Modal";
import ModalFooter from "@/components/modal-primitives/ModalFooter";
import ModalHeader from "@/components/modal-primitives/ModalHeader";
import SettingsSkeleton from "@/components/skeletons/SettingsSkeleton";
import { useMutationGuard } from "@/hooks/useMutationGuard";
import { apiClient, SKIP_ERROR_TOAST } from "@/lib/api";
import { resolveErrorMessage } from "@/lib/api-error";
import type {
  GdprCreateRequest,
  GdprErrorResponse,
  GdprExport,
  GdprExportType,
  GdprGuild,
  GdprRequest,
  GdprStatus,
} from "@/types";

type RequestKind = GdprCreateRequest["type"];
type Flow = { kind: RequestKind; scope: GdprCreateRequest["scope"] };

const CATEGORIES: Record<GdprExportType, { key: string; label: string; description: string }[]> = {
  server: [
    {
      key: "settings",
      label: "Settings",
      description:
        "Ticket, claim, colour and language settings, plus staff override and dashboard onboarding",
    },
    {
      key: "panels",
      label: "Panels",
      description:
        "Panels with their welcome messages, mentions, teams, access rules and close reasons",
    },
    {
      key: "support_hours",
      label: "Support hours",
      description: "Support hours set on your panels",
    },
    {
      key: "multi_panels",
      label: "Multi-panels",
      description: "Multi-panels and the panels they contain",
    },
    {
      key: "forms",
      label: "Forms",
      description: "Forms with their inputs and API settings (secret header values are withheld)",
    },
    { key: "tags", label: "Tags", description: "Tags and their content" },
    {
      key: "staff",
      label: "Staff",
      description: "Support teams, staff permissions and on-call members",
    },
    {
      key: "blacklist",
      label: "Blacklist",
      description: "Users and roles blacklisted in the server",
    },
    {
      key: "knowledge_base",
      label: "Knowledge base",
      description: "Knowledge base settings, categories, articles and article feedback",
    },
    {
      key: "integrations",
      label: "Integrations",
      description: "Integrations enabled in the server (secret values are withheld)",
    },
    {
      key: "tickets",
      label: "Tickets",
      description:
        "Ticket records with members, claims, labels, close reasons, ratings and survey answers",
    },
    { key: "transcripts", label: "Transcripts", description: "Transcripts of closed tickets" },
    { key: "audit_log", label: "Audit log", description: "The server's dashboard audit log" },
    {
      key: "gallery",
      label: "Gallery",
      description: "Gallery listings submitted from this server",
    },
  ],
  user: [
    {
      key: "settings",
      label: "Settings",
      description: "Your notification preferences and email address",
    },
    {
      key: "account",
      label: "Account",
      description:
        "Your dashboard account, its server list, any bot staff role and feature test exposures",
    },
    {
      key: "notifications",
      label: "Notifications",
      description: "Notifications sent to you on the dashboard",
    },
    {
      key: "tickets",
      label: "Tickets",
      description: "Records of tickets you opened or took part in, with their close reasons",
    },
    {
      key: "staff_activity",
      label: "Staff activity",
      description:
        "Your staff roles, teams, claims, close requests, response times and tickets you closed",
    },
    {
      key: "premium",
      label: "Premium",
      description: "Your premium purchases, keys, entitlements and votes",
    },
    { key: "affiliate", label: "Affiliate", description: "Your affiliate code and referrals" },
    {
      key: "whitelabel",
      label: "Whitelabel",
      description:
        "Your whitelabel bot, its servers, statuses and errors (the bot token is withheld)",
    },
    {
      key: "integrations",
      label: "Integrations",
      description: "Custom integrations you created (secret values are withheld)",
    },
    { key: "gallery", label: "Gallery", description: "Gallery listings you submitted" },
    {
      key: "feedback",
      label: "Feedback",
      description: "Your knowledge base feedback, plus ratings and survey answers on your tickets",
    },
    {
      key: "blacklists",
      label: "Blacklists",
      description: "Blacklist entries about you or servers you own (reasons are withheld)",
    },
    { key: "audit_log", label: "Audit log", description: "Changes you made on the dashboard" },
    {
      key: "gdpr_requests",
      label: "GDPR requests",
      description: "Your previous GDPR requests and their status",
    },
    {
      key: "discord_data",
      label: "Discord data",
      description: "Your Discord profile and server member data from our cache",
    },
    {
      key: "transcripts",
      label: "Transcripts",
      description: "Your own messages in ticket transcripts",
    },
  ],
};

const EXPORT_LABELS: Record<GdprExportType, string> = {
  server: "server data",
  user: "personal data",
};

const FLOW_TITLES: Record<RequestKind, Record<Flow["scope"], string>> = {
  anonymize: {
    all: "Anonymize Your Messages in Servers",
    specific: "Anonymize Your Messages in Specific Tickets",
  },
  transcripts: {
    all: "Delete All Transcripts from Servers",
    specific: "Delete Specific Transcripts",
  },
  server: { all: "Export All Server Data", specific: "Export Specific Server Data" },
  user: { all: "Export All Personal Data", specific: "Export Specific Personal Data" },
};

const REQUEST_LABELS: Record<GdprRequest["request_type"], string> = {
  AllTranscripts: "Delete all transcripts",
  SpecificTranscripts: "Delete specific transcripts",
  AllMessages: "Anonymize all messages",
  SpecificMessages: "Anonymize messages in specific tickets",
  ExportGuild: "Server data export",
  ExportUser: "Personal data export",
};

const STATUS_BADGES: Record<string, { label: string; colour: string }> = {
  queued: { label: "Queued", colour: "bg-amber-600" },
  processing: { label: "Processing", colour: "bg-blue-600" },
  ready: { label: "Ready", colour: "bg-green-600" },
  completed: { label: "Completed", colour: "bg-green-600" },
  failed: { label: "Failed", colour: "bg-red-600" },
  no_data: { label: "No data", colour: "bg-gray-600" },
  expired: { label: "Expired", colour: "bg-gray-600" },
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}

function limitText(type: GdprExportType, next: string): string {
  return `You can request your next ${EXPORT_LABELS[type]} export on ${formatDateTime(next)}.`;
}

function blockedNote(status: GdprStatus | null, kind: RequestKind): string | null {
  if (kind === "anonymize") {
    return status?.transcript_guilds.length === 0
      ? "No servers found where you have messages in ticket transcripts."
      : null;
  }
  if (kind === "transcripts") {
    return status?.owned_transcript_guilds.length === 0
      ? "No servers found where you are the owner and have transcripts."
      : null;
  }
  if (kind === "server" && status?.owned_guilds.length === 0) {
    return "No servers found where you are the owner.";
  }
  const next = status?.next_export_at[kind];
  return next && new Date(next) > new Date() ? limitText(kind, next) : null;
}

function dataSummary(
  type: GdprExportType,
  categories: string[],
  ticketIds: (string | number)[] | null,
  ticketGuild?: GdprGuild,
): string {
  if (categories.length === CATEGORIES[type].length && !ticketIds?.length) return "All data";
  return CATEGORIES[type]
    .filter((c) => categories.includes(c.key))
    .map((c) => {
      if (c.key !== "transcripts") return c.label;
      if (!ticketIds?.length) return `${c.label} (all)`;
      const from = ticketGuild ? ` from ${ticketGuild.name}` : "";
      return `${c.label} (tickets ${ticketIds.join(", ")}${from})`;
    })
    .join(", ");
}

function requestState({ status, request_type, export: exp }: GdprRequest): string {
  // Cleanup deletes an export's row after 30 days; a ready one's log becomes Expired, so Completed means no data.
  if (
    !exp &&
    status === "Completed" &&
    (request_type === "ExportGuild" || request_type === "ExportUser")
  ) {
    return "no_data";
  }
  if (!exp) return status.toLowerCase();
  return exp.status === "ready" && !exp.downloadable ? "expired" : exp.status;
}

function isPending(request: GdprRequest): boolean {
  const state = requestState(request);
  // Rows stuck at Queued (e.g. a lost publish) would otherwise toast and poll forever.
  return (
    (state === "queued" || state === "processing") &&
    Date.now() - Date.parse(request.requested_at) < 24 * 3600_000
  );
}

function StatusBadge({ request }: { request: GdprRequest }) {
  const state = requestState(request);
  return (
    <span
      className={`inline-block text-white text-xs px-2 py-0.5 rounded ${STATUS_BADGES[state]?.colour ?? "bg-gray-600"}`}
    >
      {STATUS_BADGES[state]?.label ?? state}
    </span>
  );
}

function ExportContents({ exp }: { exp: GdprExport }) {
  return (
    <>
      {exp.type === "server" && (
        <div className="text-white">{exp.guilds.map((g) => g.name).join(", ")}</div>
      )}
      {dataSummary(
        exp.type,
        exp.categories,
        exp.ticket_ids,
        exp.type === "user" ? exp.guilds[0] : undefined,
      )}
    </>
  );
}

export default function Gdpr() {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<GdprStatus | null>(null);
  const [requests, setRequests] = useState<GdprRequest[]>([]);
  const [starting, setStarting] = useState<string | null>(null);
  const [flow, setFlow] = useState<Flow | null>(null);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const loadSeq = useRef(0);
  const appliedSeq = useRef(0);
  const toastedIds = useRef(new Set<number>());
  const titleId = useId();
  const [searchParams, setSearchParams] = useSearchParams();
  const exportIdParam = searchParams.get("export_id");
  const handledExportId = useRef<string | null>(null);

  const loadStatus = useCallback(async (config?: AxiosRequestConfig) => {
    try {
      const { data } = await apiClient.gdpr.status(config);
      setStatus(data);
      return data;
    } catch {
      return null;
    }
  }, []);

  const loadRequests = useCallback(async (config?: AxiosRequestConfig) => {
    const seq = ++loadSeq.current;
    try {
      const { data } = await apiClient.gdpr.listRequests(config);
      // Drop stale responses so a finished request can't flip back to pending.
      if (seq > appliedSeq.current) {
        appliedSeq.current = seq;
        setRequests(data ?? []);
      }
    } catch {
      // Interceptor handles error display
    }
  }, []);

  const reload = useCallback(
    () => Promise.all([loadStatus(), loadRequests()]),
    [loadStatus, loadRequests],
  );

  useEffect(() => {
    reload().finally(() => setLoading(false));
  }, [reload]);

  const download = useCallback(
    async (exportId: number) => {
      setDownloadingId(exportId);
      try {
        const { data } = await apiClient.gdpr.download(exportId);
        window.location.assign(data.url);
      } catch {
        loadRequests();
      } finally {
        setDownloadingId(null);
      }
    },
    [loadRequests],
  );

  useEffect(() => {
    // StrictMode runs effects twice; the ref resets once the param is gone so the same link works again.
    if (exportIdParam === handledExportId.current) return;
    handledExportId.current = exportIdParam;
    if (exportIdParam === null) return;
    const exportId = Number(exportIdParam);
    if (/^\d+$/.test(exportIdParam) && Number.isSafeInteger(exportId)) void download(exportId);
    setSearchParams(
      (params) => {
        params.delete("export_id");
        return params;
      },
      { replace: true },
    );
  }, [exportIdParam, download, setSearchParams]);

  const hasPending = requests.some(isPending);

  useEffect(() => {
    if (!hasPending) return;
    const id = setInterval(() => void loadRequests(SKIP_ERROR_TOAST), 5000);
    return () => clearInterval(id);
  }, [hasPending, loadRequests]);

  useEffect(() => {
    let finished = false;
    for (const request of requests) {
      const id = `gdpr-request-${request.id}`;
      const label = REQUEST_LABELS[request.request_type] ?? request.request_type;
      const state = requestState(request);

      if (isPending(request)) {
        toastedIds.current.add(request.id);
        toast.loading(`${label}: ${state === "processing" ? "preparing" : "queued"}…`, {
          id,
          duration: Infinity,
        });
        continue;
      }

      if (!toastedIds.current.delete(request.id)) continue;
      finished = true;
      // An updated toast keeps its stack slot, so a new toast brings the result to the front.
      toast.dismiss(id);
      const exp = request.export;
      if (state === "ready" && exp) {
        toast.success(`${label}: ready to download`, {
          duration: 10000,
          action: { label: "Download", onClick: () => void download(exp.id) },
        });
      } else if (state === "completed") {
        toast.success(`${label}: completed`, { duration: 6000 });
      } else if (state === "no_data") {
        toast.info(`${label}: no data to export`, { duration: 6000 });
      } else if (state === "failed") {
        toast.error(`${label}: failed. Please try again.`, { duration: 8000 });
      }
    }
    if (finished) void loadStatus(SKIP_ERROR_TOAST);
  }, [requests, download, loadStatus]);

  useEffect(() => {
    const ids = toastedIds.current;
    return () => {
      ids.forEach((id) => toast.dismiss(`gdpr-request-${id}`));
      ids.clear();
    };
  }, []);

  useEffect(() => {
    // Polling stops when nothing is pending; this picks up requests made with /gdpr in Discord.
    const onFocus = () =>
      void Promise.all([loadStatus(SKIP_ERROR_TOAST), loadRequests(SKIP_ERROR_TOAST)]);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [loadStatus, loadRequests]);

  const startFlow = async (next: Flow, trigger: HTMLButtonElement) => {
    triggerRef.current = trigger;
    setStarting(`${next.kind}-${next.scope}`);
    const fresh = await loadStatus();
    // Commit the re-enabled trigger now so it can take focus back.
    flushSync(() => setStarting(null));
    if (fresh?.worker_online && !blockedNote(fresh, next.kind)) {
      setFlow(next);
    } else {
      trigger.focus();
    }
  };

  const closeFlow = () => {
    setFlow(null);
    // Disabling the trigger while status loads drops its focus, so the modal can't restore it.
    triggerRef.current?.focus();
  };

  const downloadButton = ({ export: exp, requested_at }: GdprRequest) =>
    exp?.downloadable && (
      <Button
        variant="primary"
        size="sm"
        onClick={() => download(exp.id)}
        isLoading={downloadingId === exp.id}
        disabled={downloadingId !== null}
        aria-label={`Download export requested ${formatDateTime(requested_at)}`}
      >
        Download
      </Button>
    );

  const title = "GDPR Requests";
  const subtitle = "Export your data, anonymize your messages and delete transcripts";

  if (loading) {
    return (
      <MainLayout title={title} subtitle={subtitle}>
        <SettingsSkeleton />
      </MainLayout>
    );
  }

  const offline = status !== null && !status.worker_online;

  const sections = [
    {
      kind: "anonymize" as const,
      title: "Message Anonymization",
      icon: faUserSecret,
      description: "Anonymize your messages in the transcripts of servers.",
      buttons: ["All your messages in servers", "Your messages in specific tickets"],
      note: blockedNote(status, "anonymize"),
    },
    {
      kind: "transcripts" as const,
      title: "Transcript Deletion",
      icon: faTrash,
      description: "Delete transcripts from servers you own.",
      buttons: ["All transcripts from servers", "Specific transcripts"],
      note: blockedNote(status, "transcripts"),
    },
    {
      kind: "user" as const,
      title: "Personal Data Export",
      icon: faFileExport,
      description: "Export the data we hold about you.",
      buttons: ["All data", "Specific data"],
      note: blockedNote(status, "user"),
    },
    {
      kind: "server" as const,
      title: "Server Data Export",
      icon: faServer,
      description: "Export the data we hold for servers you own.",
      buttons: ["All data", "Specific data"],
      note: blockedNote(status, "server"),
    },
  ];

  return (
    <MainLayout title={title} subtitle={subtitle}>
      <div
        role="status"
        aria-live="polite"
        className={
          offline
            ? "rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 mb-6"
            : undefined
        }
      >
        {offline && (
          <div className="flex items-start gap-3">
            <FontAwesomeIcon
              icon={faExclamationTriangle}
              className="mt-0.5 h-4 w-4 shrink-0 text-amber-400"
              aria-hidden="true"
            />
            <div>
              <p className="text-sm font-medium text-amber-200">
                New requests are temporarily unavailable
              </p>
              <p className="text-sm text-amber-300/80 mt-1">
                Our GDPR service is offline. You can still download your exports below. Please try
                again later.
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {sections.map((section) => (
            <section
              key={section.kind}
              aria-labelledby={`gdpr-${section.kind}-heading`}
              className="bg-gray-800 rounded-xl p-6 flex flex-col"
            >
              <div className="flex items-center gap-2 mb-2">
                <FontAwesomeIcon icon={section.icon} className="text-blue-400" aria-hidden="true" />
                <h2
                  id={`gdpr-${section.kind}-heading`}
                  className="text-lg font-semibold text-white"
                >
                  {section.title}
                </h2>
              </div>
              <p className="text-sm text-gray-300 mb-4">{section.description}</p>
              {section.note && <p className="text-xs text-amber-300 mb-4">{section.note}</p>}
              <div className="mt-auto flex flex-col sm:flex-row lg:flex-col gap-2">
                {(["all", "specific"] as const).map((scope, i) => (
                  <Button
                    key={scope}
                    variant="secondary"
                    onClick={(e) => startFlow({ kind: section.kind, scope }, e.currentTarget)}
                    disabled={!status || starting !== null}
                    visuallyDisabled={offline || section.note !== null}
                    isLoading={starting === `${section.kind}-${scope}`}
                  >
                    {section.buttons[i]}
                  </Button>
                ))}
              </div>
            </section>
          ))}
        </div>

        <section aria-labelledby="gdpr-requests-heading" className="bg-gray-800 rounded-xl p-6">
          <h2 id="gdpr-requests-heading" className="text-lg font-semibold text-white mb-4">
            Your Requests
          </h2>

          {requests.length === 0 ? (
            <EmptyState
              icon={faUserShield}
              title="No requests yet"
              description="Your GDPR requests, including ones made with the /gdpr command, will appear here."
            />
          ) : (
            <>
              <div className="hidden xl:block">
                <Table variant="compact">
                  <Table.Head>
                    <Table.Row>
                      <Table.HeaderCell>Requested</Table.HeaderCell>
                      <Table.HeaderCell>Request</Table.HeaderCell>
                      <Table.HeaderCell>Contents</Table.HeaderCell>
                      <Table.HeaderCell>Status</Table.HeaderCell>
                      <Table.HeaderCell>Expires</Table.HeaderCell>
                      <Table.HeaderCell>
                        <span className="sr-only">Download</span>
                      </Table.HeaderCell>
                    </Table.Row>
                  </Table.Head>
                  <Table.Body>
                    {requests.map((request) => (
                      <Table.Row key={request.id}>
                        <Table.Cell className="px-4 py-3 whitespace-nowrap">
                          {formatDateTime(request.requested_at)}
                        </Table.Cell>
                        <Table.Cell>
                          {REQUEST_LABELS[request.request_type] ?? request.request_type}
                        </Table.Cell>
                        <Table.Cell className="px-4 py-3 text-gray-300">
                          {request.export ? <ExportContents exp={request.export} /> : "-"}
                        </Table.Cell>
                        <Table.Cell>
                          <StatusBadge request={request} />
                        </Table.Cell>
                        <Table.Cell className="px-4 py-3 whitespace-nowrap">
                          {request.export?.status === "ready"
                            ? formatDateTime(request.export.expires_at)
                            : "-"}
                        </Table.Cell>
                        <Table.Cell className="px-4 py-3 text-right">
                          {downloadButton(request)}
                        </Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table>
              </div>

              <div className="xl:hidden space-y-3">
                {requests.map((request) => (
                  <div key={request.id} className="bg-gray-900/50 rounded-lg p-4 space-y-2">
                    <div className="flex justify-between items-start gap-3">
                      <span className="text-white">
                        {REQUEST_LABELS[request.request_type] ?? request.request_type}
                      </span>
                      <StatusBadge request={request} />
                    </div>
                    {request.export && (
                      <div className="text-sm text-gray-300">
                        <ExportContents exp={request.export} />
                      </div>
                    )}
                    <div className="text-xs text-gray-400">
                      {formatDateTime(request.requested_at)}
                      {request.export?.status === "ready" &&
                        ` • Expires ${formatDateTime(request.export.expires_at)}`}
                    </div>
                    {downloadButton(request)}
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      </div>

      <ActionModal
        isOpen={flow !== null}
        onClose={closeFlow}
        ariaLabelledBy={titleId}
        className="max-w-2xl max-h-[90vh] overflow-y-auto"
      >
        {flow && status && (
          <RequestFlow
            flow={flow}
            status={status}
            titleId={titleId}
            onClose={closeFlow}
            onQueued={(requestId) => {
              // Marked before the reload so a request that already finished still gets its result toast.
              toastedIds.current.add(requestId);
              void reload();
            }}
            onBlocked={loadStatus}
          />
        )}
      </ActionModal>
    </MainLayout>
  );
}

function RequestFlow({
  flow: { kind, scope },
  status,
  titleId,
  onClose,
  onQueued,
  onBlocked,
}: {
  flow: Flow;
  status: GdprStatus;
  titleId: string;
  onClose: () => void;
  onQueued: (requestId: number) => void;
  onBlocked: () => void;
}) {
  const startsAtConfirm = kind === "user" && scope === "all";
  const [step, setStep] = useState<"form" | "confirm">(startsAtConfirm ? "confirm" : "form");
  const [guildIds, setGuildIds] = useState<string[]>([]);
  const [guildId, setGuildId] = useState<string | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [ticketIds, setTicketIds] = useState("");
  const [ticketError, setTicketError] = useState<string>();
  const [error, setError] = useState<string | null>(null);
  const { isSubmitting, guard } = useMutationGuard();
  const descriptionId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  // Each step replaces the focused button, which would otherwise drop focus to the body.
  useEffect(() => {
    rootRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)?.focus();
  }, [step]);

  const exportType = kind === "server" || kind === "user" ? kind : null;
  const multi = scope === "all" && kind !== "user";
  const guilds =
    kind === "server"
      ? status.owned_guilds
      : kind === "transcripts"
        ? status.owned_transcript_guilds
        : status.transcript_guilds;
  const guildOptions = guilds.map((g) => ({ key: g.id, label: g.name }));
  const selectedGuildIds = multi ? guildIds : guildId ? [guildId] : [];
  const selectedGuilds = guilds.filter((g) => selectedGuildIds.includes(g.id));
  const showTicketIds =
    scope === "specific" &&
    (!exportType || categories.includes("transcripts")) &&
    (kind !== "user" || guilds.length > 0);
  // Same separators and range as the bot's ticket ID parser.
  const ticketList = [...new Set(ticketIds.split(/[,; \n\r\t]+/).filter(Boolean))];
  const badIds = ticketList.filter((t) => !/^\d+$/.test(t) || +t < 1 || +t > 2147483647);

  const canContinue =
    (multi ? guildIds.length > 0 : kind === "user" || guildId !== null) &&
    (exportType !== null || scope === "all" || ticketList.length > 0) &&
    (!exportType || scope === "all" || categories.length > 0) &&
    (kind !== "user" || !guildId === (ticketList.length === 0));

  const toggleCategory = (key: string, checked: boolean) => {
    setCategories((prev) => (checked ? [...prev, key] : prev.filter((k) => k !== key)));
    if (key === "transcripts" && !checked) {
      setTicketIds("");
      setTicketError(undefined);
      if (kind === "user") setGuildId(null);
    }
  };

  const submit = () =>
    guard(async () => {
      setError(null);
      try {
        const { data } = await apiClient.gdpr.createRequest({
          type: kind,
          scope,
          guild_ids: selectedGuildIds,
          ticket_ids: ticketIds.trim(),
          categories: scope === "specific" ? categories : [],
        });
        onQueued(data.request_id);
        onClose();
      } catch (err) {
        const data = (err as AxiosError<GdprErrorResponse>).response?.data;
        if (data?.invalid_ticket_ids?.length) {
          setTicketError(data.error);
          setStep("form");
          return;
        }
        if (data?.worker_offline || data?.next_allowed_at) onBlocked();
        setError(
          data?.next_allowed_at && exportType
            ? limitText(exportType, data.next_allowed_at)
            : resolveErrorMessage(err),
        );
      }
    });

  if (step === "confirm") {
    const rows: [string, string][] = [];
    if (kind !== "user" && selectedGuilds.length > 0) {
      rows.push([
        selectedGuilds.length > 1 ? "Servers" : "Server",
        selectedGuilds.map((g) => g.name).join(", "),
      ]);
    }
    if (exportType) {
      const picked = scope === "all" ? CATEGORIES[exportType].map((c) => c.key) : categories;
      const ticketGuild = kind === "user" ? selectedGuilds[0] : undefined;
      rows.push([
        "Data",
        dataSummary(exportType, picked, showTicketIds ? ticketList : null, ticketGuild),
      ]);
    } else if (scope === "specific") {
      rows.push(["Tickets", ticketList.join(", ")]);
    }

    return (
      <div ref={rootRef} className="p-6">
        <ModalHeader id={titleId} title={FLOW_TITLES[kind][scope]} />
        <dl className="space-y-3 text-sm">
          {rows.map(([term, value]) => (
            <div key={term}>
              <dt className="text-gray-400">{term}</dt>
              <dd className="text-white">{value}</dd>
            </div>
          ))}
        </dl>
        {!exportType ? (
          <div className="mt-4 flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3">
            <FontAwesomeIcon
              icon={faExclamationTriangle}
              className="mt-0.5 h-4 w-4 shrink-0 text-amber-400"
              aria-hidden="true"
            />
            <p className="text-sm text-amber-200">
              <strong>Warning:</strong> This action is permanent and cannot be undone. Do you
              understand and accept that this action is permanent?
            </p>
          </div>
        ) : (
          <p className="mt-4 text-sm text-gray-300">
            You can request one export of each type every 24 hours. When it&apos;s ready, you can
            download it from this page for 30 days.
          </p>
        )}
        {error && (
          <p role="alert" className="mt-4 text-sm text-red-400">
            {error}
          </p>
        )}
        <ModalFooter>
          <Button
            variant="secondary"
            onClick={
              startsAtConfirm
                ? onClose
                : () => {
                    setError(null);
                    setStep("form");
                  }
            }
            disabled={isSubmitting}
          >
            {startsAtConfirm ? "Cancel" : "Back"}
          </Button>
          <Button
            variant={exportType ? "primary" : "danger"}
            onClick={submit}
            isLoading={isSubmitting}
          >
            {exportType ? "Request export" : "Confirm - I understand"}
          </Button>
        </ModalFooter>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="p-6">
      <ModalHeader id={titleId} title={FLOW_TITLES[kind][scope]} />
      <div className="space-y-4">
        {multi && (
          <MultiSelect
            label="Servers"
            required
            value={guildIds}
            onChange={setGuildIds}
            options={guildOptions}
            placeholder="Select one or more servers"
          />
        )}
        {!multi && kind !== "user" && (
          <Select
            label="Server"
            required
            value={guildId}
            onChange={setGuildId}
            options={guildOptions}
            placeholder="Select a server"
          />
        )}
        {exportType && scope === "specific" && (
          <fieldset>
            <legend className="mb-2 text-white">
              Data to export
              <RequiredMark />
            </legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
              {CATEGORIES[exportType].map((category) => (
                <div key={category.key}>
                  <Checkbox
                    checked={categories.includes(category.key)}
                    onChange={(checked) => toggleCategory(category.key, checked)}
                    label={category.label}
                    ariaDescribedBy={`${descriptionId}-${category.key}`}
                  />
                  <p id={`${descriptionId}-${category.key}`} className="ml-6 text-xs text-gray-400">
                    {category.description}
                  </p>
                </div>
              ))}
            </div>
          </fieldset>
        )}
        {kind === "user" && showTicketIds && (
          <Select
            label="Server"
            value={guildId}
            onChange={setGuildId}
            options={guildOptions}
            placeholder="Select a server"
            showNoneOption
          />
        )}
        {showTicketIds && (
          <div>
            <TextInput
              label="Ticket IDs"
              required={!exportType}
              value={ticketIds}
              onChange={(value) => {
                setTicketIds(value);
                setTicketError(undefined);
              }}
              placeholder="e.g. 123, 456, 789"
              maxLength={1000}
              error={ticketError}
              descriptionId={exportType ? `${descriptionId}-ticket-hint` : undefined}
            />
            {exportType && (
              <p id={`${descriptionId}-ticket-hint`} className="mt-1 text-xs text-gray-400">
                {kind === "user"
                  ? "Optional. Select a server and enter ticket IDs together, or leave both empty for all of your transcripts."
                  : "Optional. Leave empty for all transcripts."}
              </p>
            )}
          </div>
        )}
      </div>
      <ModalFooter>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={() =>
            badIds.length > 0
              ? setTicketError(`These ticket IDs can't be used: ${badIds.join(", ")}`)
              : setStep("confirm")
          }
          disabled={!canContinue}
        >
          Continue
        </Button>
      </ModalFooter>
    </div>
  );
}
