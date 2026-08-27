import { useCallback, useEffect, useId, useMemo, useState, type FC } from "react";
import { useSearchParams } from "react-router";
import { toast } from "sonner";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCheck,
  faXmark,
  faCopy,
  faShield,
  faLink,
  faServer,
  faEye,
} from "@fortawesome/free-solid-svg-icons";
import { apiClient } from "@/lib/api";
import type { Integration } from "@/types";
import Button from "@/components/Button";
import ConfirmModal from "@/components/modals/ConfirmModal";
import ActionModal from "@/components/modal-primitives/ActionModal";
import DismissibleModal from "@/components/modal-primitives/DismissibleModal";
import Pagination from "@/components/Pagination";
import SearchInput from "@/components/SearchInput";
import ImageWithFallback from "@/components/ImageWithFallback";
import Table from "@/components/Table";
import Tabs from "@/components/Tabs";
import Textarea from "@/components/Textarea";
import TableSkeleton from "@/components/skeletons/TableSkeleton";
import { useUrlSearch } from "@/hooks/useUrlSearch";
import { matchesSearch } from "@/lib/search";
import { userAvatarUrl } from "@/lib/discord-cdn";
import { isSafeUrl } from "@/lib/url";

type TabStatus = "pending" | "approved" | "rejected";

const PER_PAGE = 25;
const SEARCH_FETCH_LIMIT = 500;
const REJECT_MAX = 500;
const UNAPPROVE_MAX = 500;

interface AdminIntegration {
  id: number;
  owner_id: string;
  name: string;
  description: string;
  webhook_url: string;
  http_method: string;
  validation_url: string | null;
  image_url: string | null;
  privacy_policy_url: string | null;
  public: boolean;
  approved: boolean;
  rejection_reason: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  guild_count: number;
  author?: {
    id: string;
    username: string;
    avatar: string | null;
  } | null;
}

interface ListResponse {
  integrations: AdminIntegration[];
  total: number;
  page: number;
  limit: number;
}

const STATUS_BADGE: Record<TabStatus, string> = {
  pending: "bg-amber-500/30 text-amber-200 ring-1 ring-amber-400/40",
  approved: "bg-green-500/30 text-green-200 ring-1 ring-green-400/40",
  rejected: "bg-red-500/30 text-red-200 ring-1 ring-red-400/40",
};

const TABS: TabStatus[] = ["pending", "approved", "rejected"];

function isTab(value: string | null): value is TabStatus {
  return value === "pending" || value === "approved" || value === "rejected";
}

function parsePage(raw: string | null): number {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

const EMPTY_COPY: Record<TabStatus, string> = {
  pending: "No integrations pending review.",
  approved: "No approved integrations.",
  rejected: "No rejected integrations.",
};

const AdminIntegrationsPage: FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const rejectHeadingId = useId();
  const unapproveHeadingId = useId();
  const reasonHeadingId = useId();
  const previewHeadingId = useId();

  const tabFromParams = searchParams.get("status");
  const tab: TabStatus = isTab(tabFromParams) ? tabFromParams : "pending";
  const page = parsePage(searchParams.get("page"));
  const { searchQuery, setSearchQuery, debouncedSearch, isSearching } = useUrlSearch();

  const [integrations, setIntegrations] = useState<AdminIntegration[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const [approveTarget, setApproveTarget] = useState<AdminIntegration | null>(null);
  const [approving, setApproving] = useState(false);

  const [rejectTarget, setRejectTarget] = useState<AdminIntegration | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [rejectTouched, setRejectTouched] = useState(false);

  const [unapproveTarget, setUnapproveTarget] = useState<AdminIntegration | null>(null);
  const [unapproveReason, setUnapproveReason] = useState("");
  const [unapproving, setUnapproving] = useState(false);

  const [reasonTarget, setReasonTarget] = useState<AdminIntegration | null>(null);

  const [previewTarget, setPreviewTarget] = useState<AdminIntegration | null>(null);
  const [previewData, setPreviewData] = useState<Integration | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const setTab = useCallback(
    (next: TabStatus) => {
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev);
          params.set("status", next);
          params.delete("page");
          return params;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const setPage = useCallback(
    (next: number) => {
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev);
          params.set("page", String(next));
          return params;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const fetchIntegrations = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.admin.integrations.list(
        tab,
        isSearching ? 1 : page,
        isSearching ? SEARCH_FETCH_LIMIT : PER_PAGE,
      );
      const payload = res.data as ListResponse;
      let list = payload.integrations ?? [];
      if (isSearching) {
        list = list.filter((integration) =>
          matchesSearch(
            debouncedSearch,
            integration.name,
            integration.owner_id,
            integration.description,
            integration.webhook_url,
          ),
        );
      }
      setIntegrations(list);
      setTotal(isSearching ? list.length : (payload.total ?? 0));
    } catch {
      // Error handled by global interceptor
    } finally {
      setLoading(false);
    }
  }, [tab, page, debouncedSearch, isSearching]);

  useEffect(() => {
    if (isSearching && page !== 1) {
      setPage(1);
    }
  }, [debouncedSearch, isSearching, page, setPage]);

  useEffect(() => {
    fetchIntegrations();
  }, [fetchIntegrations]);

  const totalPages = useMemo(
    () => (isSearching ? 1 : Math.max(1, Math.ceil(total / PER_PAGE))),
    [isSearching, total],
  );

  const handleApprove = async () => {
    if (!approveTarget) return;
    setApproving(true);
    try {
      await apiClient.admin.integrations.approve(approveTarget.id);
      toast.success(`"${approveTarget.name}" approved.`);
      setApproveTarget(null);
      await fetchIntegrations();
    } catch {
      // Error handled by global interceptor
    } finally {
      setApproving(false);
    }
  };

  const handleReject = async () => {
    if (!rejectTarget) return;
    const trimmed = rejectReason.trim();
    if (!trimmed) {
      setRejectTouched(true);
      return;
    }

    setRejecting(true);
    try {
      await apiClient.admin.integrations.reject(rejectTarget.id, trimmed);
      toast.success(`"${rejectTarget.name}" rejected.`);
      setRejectTarget(null);
      setRejectReason("");
      setRejectTouched(false);
      await fetchIntegrations();
    } catch {
      // Error handled by global interceptor
    } finally {
      setRejecting(false);
    }
  };

  const handleUnapprove = async () => {
    if (!unapproveTarget) return;
    const trimmed = unapproveReason.trim();
    setUnapproving(true);
    try {
      await apiClient.admin.integrations.unapprove(
        unapproveTarget.id,
        trimmed.length > 0 ? trimmed : undefined,
      );
      toast.success(`"${unapproveTarget.name}" unapproved.`);
      setUnapproveTarget(null);
      setUnapproveReason("");
      await fetchIntegrations();
    } catch {
      // Error handled by global interceptor
    } finally {
      setUnapproving(false);
    }
  };

  const handleCopyWebhook = async (integration: AdminIntegration) => {
    try {
      await navigator.clipboard.writeText(integration.webhook_url);
      setCopiedId(integration.id);
      toast.success("Webhook URL copied");
      setTimeout(() => {
        setCopiedId((current) => (current === integration.id ? null : current));
      }, 3000);
    } catch {
      toast.error("Could not copy to clipboard");
    }
  };

  const handlePreview = async (integration: AdminIntegration) => {
    setPreviewTarget(integration);
    setPreviewLoading(true);
    setPreviewData(null);
    try {
      const res = await apiClient.admin.integrations.detail(integration.id);
      setPreviewData(res.data);
    } catch {
      toast.error("Failed to load integration details");
      setPreviewTarget(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const rejectTrimmed = rejectReason.trim();
  const showRejectError = rejectTouched && rejectTrimmed.length === 0;

  return (
    <div>
      <header className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-semibold mb-2 text-center">Public Integrations</h1>
        <p className="text-center text-gray-400 text-sm sm:text-base">
          Review, approve, and manage publicly submitted custom integrations
        </p>
      </header>

      {/* Status tabs */}
      <Tabs
        tabs={TABS.map((status) => ({
          key: status,
          label: status.charAt(0).toUpperCase() + status.slice(1),
        }))}
        activeTab={tab}
        onChange={(key) => setTab(key as TabStatus)}
        ariaLabel="Integration review status"
        className="justify-center mb-4"
      />

      <div className="flex justify-end mb-6">
        <SearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Search integrations..."
          label="Search by name, owner, description, or webhook URL"
          className="w-full sm:w-1/2 md:w-1/3 lg:w-1/4"
        />
      </div>

      <div
        role="tabpanel"
        id={`tabpanel-${tab}`}
        aria-labelledby={`tab-${tab}`}
        aria-busy={loading}
      >
        <div role="status" aria-live="polite" className="sr-only">
          {loading
            ? "Loading integrations"
            : `Showing page ${page} of ${totalPages}, ${integrations.length} integrations`}
        </div>
        {loading ? (
          <TableSkeleton rows={8} columns={7} showHeader={false} />
        ) : integrations.length === 0 ? (
          <p className="text-gray-400 text-center py-8">
            {debouncedSearch ? `No integrations match "${debouncedSearch}".` : EMPTY_COPY[tab]}
          </p>
        ) : (
          <Table variant="compact" className="bg-gray-800 rounded-xl">
            <Table.Head className="text-xs text-gray-400 uppercase bg-gray-700">
              <Table.Row className="[&>th]:px-4 [&>th]:py-3">
                <Table.HeaderCell>Name</Table.HeaderCell>
                <Table.HeaderCell>Owner</Table.HeaderCell>
                <Table.HeaderCell>Description</Table.HeaderCell>
                <Table.HeaderCell>Webhook URL</Table.HeaderCell>
                <Table.HeaderCell>Links</Table.HeaderCell>
                {tab !== "pending" && <Table.HeaderCell>Guilds</Table.HeaderCell>}
                <Table.HeaderCell>Actions</Table.HeaderCell>
              </Table.Row>
            </Table.Head>
            <Table.Body>
              {integrations.map((integration) => (
                <Table.Row
                  key={integration.id}
                  className="border-b border-gray-700 hover:bg-gray-800/50 align-top"
                >
                  <Table.Cell>
                    <div className="flex items-start gap-2">
                      <ImageWithFallback
                        src={integration.image_url}
                        alt=""
                        className="w-6 h-6 rounded shrink-0 mt-0.5"
                        fallbackIconClassName="text-gray-500 text-xs"
                      />
                      <div className="flex flex-col gap-1 min-w-0">
                        <span className="font-semibold text-white truncate">
                          {integration.name}
                        </span>
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-[11px] capitalize self-start ${STATUS_BADGE[tab]}`}
                        >
                          {tab}
                        </span>
                      </div>
                    </div>
                  </Table.Cell>
                  <Table.Cell>
                    <div className="flex items-center gap-2">
                      {integration.author && (
                        <img
                          src={userAvatarUrl(integration.author.id, integration.author.avatar)}
                          alt={integration.author.username}
                          className="h-6 w-6 rounded-full flex-shrink-0"
                        />
                      )}
                      <div className="flex flex-col min-w-0">
                        {integration.author && (
                          <span className="text-sm text-gray-200 truncate">
                            {integration.author.username}
                          </span>
                        )}
                        <span className="font-mono text-xs text-gray-400" title="Discord user ID">
                          {integration.owner_id}
                        </span>
                      </div>
                    </div>
                  </Table.Cell>
                  <Table.Cell>
                    <p
                      className="text-gray-300 line-clamp-2 max-w-xs"
                      title={integration.description}
                    >
                      {integration.description}
                    </p>
                  </Table.Cell>
                  <Table.Cell>
                    <div className="flex items-center gap-2 max-w-xs">
                      <span
                        className="font-mono text-xs text-gray-300 truncate"
                        title={integration.webhook_url}
                      >
                        {integration.webhook_url}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleCopyWebhook(integration)}
                        title="Copy webhook URL"
                        className="shrink-0 text-gray-400 hover:text-white"
                      >
                        <FontAwesomeIcon
                          icon={copiedId === integration.id ? faCheck : faCopy}
                          aria-hidden="true"
                        />
                      </Button>
                    </div>
                  </Table.Cell>
                  <Table.Cell>
                    <div className="flex items-center gap-3 text-gray-400">
                      {integration.privacy_policy_url &&
                      isSafeUrl(integration.privacy_policy_url) ? (
                        <a
                          href={integration.privacy_policy_url}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`Privacy policy for ${integration.name} (opens in new tab)`}
                          className="rounded hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-800"
                        >
                          <FontAwesomeIcon icon={faShield} aria-hidden="true" />
                        </a>
                      ) : null}
                      {integration.validation_url && isSafeUrl(integration.validation_url) ? (
                        <a
                          href={integration.validation_url}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`Validation URL for ${integration.name} (opens in new tab)`}
                          className="rounded hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-800"
                        >
                          <FontAwesomeIcon icon={faLink} aria-hidden="true" />
                        </a>
                      ) : null}
                      {!(
                        integration.privacy_policy_url && isSafeUrl(integration.privacy_policy_url)
                      ) &&
                        !(integration.validation_url && isSafeUrl(integration.validation_url)) && (
                          <span className="text-gray-600 text-xs">&mdash;</span>
                        )}
                    </div>
                  </Table.Cell>
                  {tab !== "pending" && (
                    <Table.Cell>
                      <span
                        className="inline-flex items-center gap-1.5 text-gray-300"
                        title="Guilds with this integration active"
                      >
                        <FontAwesomeIcon
                          icon={faServer}
                          className="text-gray-500 text-xs"
                          aria-hidden="true"
                        />
                        {integration.guild_count}
                      </span>
                    </Table.Cell>
                  )}
                  <Table.Cell>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handlePreview(integration)}
                        title="Preview user experience"
                      >
                        <FontAwesomeIcon icon={faEye} className="mr-1" aria-hidden="true" />
                        Preview
                      </Button>
                      {tab === "pending" && (
                        <>
                          <Button
                            variant="success"
                            size="sm"
                            onClick={() => setApproveTarget(integration)}
                          >
                            <FontAwesomeIcon icon={faCheck} className="mr-1" aria-hidden="true" />
                            Approve
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => setRejectTarget(integration)}
                          >
                            <FontAwesomeIcon icon={faXmark} className="mr-1" aria-hidden="true" />
                            Reject
                          </Button>
                        </>
                      )}
                      {tab === "approved" && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setUnapproveTarget(integration)}
                        >
                          Unapprove
                        </Button>
                      )}
                      {tab === "rejected" && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setReasonTarget(integration)}
                            className="text-xs text-blue-300 hover:text-blue-200 underline decoration-dotted underline-offset-2"
                          >
                            View reason
                          </Button>
                          <Button
                            variant="success"
                            size="sm"
                            onClick={() => setApproveTarget(integration)}
                          >
                            <FontAwesomeIcon icon={faCheck} className="mr-1" aria-hidden="true" />
                            Approve
                          </Button>
                        </>
                      )}
                    </div>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        )}

        {!loading && !isSearching && (
          <Pagination
            variant="full"
            page={page}
            totalPages={totalPages}
            onChange={setPage}
            disabled={loading}
          />
        )}
      </div>

      {/* Approve confirmation */}
      <ConfirmModal
        isOpen={!!approveTarget}
        title="Approve integration"
        message={
          approveTarget
            ? `Approve "${approveTarget.name}"? It will become available to all servers.`
            : ""
        }
        confirmText={approving ? "Approving..." : "Approve"}
        cancelText="Cancel"
        confirmVariant="success"
        onConfirm={handleApprove}
        onCancel={() => {
          if (!approving) setApproveTarget(null);
        }}
      />

      {/* Reject with reason */}
      <ActionModal
        isOpen={!!rejectTarget}
        onClose={() => {
          if (!rejecting) {
            setRejectTarget(null);
            setRejectReason("");
            setRejectTouched(false);
          }
        }}
        ariaLabelledBy={rejectHeadingId}
      >
        <div className="p-6">
          <h3 id={rejectHeadingId} className="text-xl font-semibold mb-4">
            Reject integration
          </h3>
          <p className="text-gray-300 mb-4">
            Rejecting &ldquo;{rejectTarget?.name}&rdquo;. The owner will see the reason below.
          </p>
          <Textarea
            label="Reason for rejection (required)"
            placeholder="Explain why this integration was rejected..."
            value={rejectReason}
            onChange={(value) => setRejectReason(value)}
            onBlur={() => setRejectTouched(true)}
            max={REJECT_MAX}
            error={showRejectError ? "Please provide a reason for rejection." : undefined}
          />
          <div className="flex justify-end gap-3 mt-4">
            <Button
              variant="secondary"
              onClick={() => {
                if (rejecting) return;
                setRejectTarget(null);
                setRejectReason("");
                setRejectTouched(false);
              }}
              disabled={rejecting}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleReject}
              disabled={rejecting}
              isLoading={rejecting}
            >
              {rejecting ? "Rejecting..." : "Reject"}
            </Button>
          </div>
        </div>
      </ActionModal>

      {/* Unapprove with optional reason */}
      <ActionModal
        isOpen={!!unapproveTarget}
        onClose={() => {
          if (!unapproving) {
            setUnapproveTarget(null);
            setUnapproveReason("");
          }
        }}
        ariaLabelledBy={unapproveHeadingId}
      >
        <div className="p-6">
          <h3 id={unapproveHeadingId} className="text-xl font-semibold mb-4">
            Unapprove integration
          </h3>
          <p className="text-gray-300 mb-4">
            Removing approval from &ldquo;{unapproveTarget?.name}&rdquo;. It will no longer appear
            as publicly available.
          </p>
          <Textarea
            label="Reason (optional)"
            placeholder="Optional note for the owner..."
            value={unapproveReason}
            onChange={(value) => setUnapproveReason(value)}
            max={UNAPPROVE_MAX}
          />
          <div className="flex justify-end gap-3 mt-4">
            <Button
              variant="secondary"
              onClick={() => {
                if (unapproving) return;
                setUnapproveTarget(null);
                setUnapproveReason("");
              }}
              disabled={unapproving}
            >
              Cancel
            </Button>
            <Button
              variant="secondary"
              onClick={handleUnapprove}
              disabled={unapproving || unapproveReason.length > UNAPPROVE_MAX}
              isLoading={unapproving}
            >
              {unapproving ? "Unapproving..." : "Unapprove"}
            </Button>
          </div>
        </div>
      </ActionModal>

      {/* View rejection reason */}
      <DismissibleModal
        isOpen={!!reasonTarget}
        onClose={() => setReasonTarget(null)}
        ariaLabelledBy={reasonHeadingId}
      >
        <h3 id={reasonHeadingId} className="text-xl font-semibold mb-4">
          Rejection reason
        </h3>
        <p className="text-gray-400 text-sm mb-2">{reasonTarget?.name}</p>
        <div className="bg-gray-900 border border-gray-700 rounded p-3 text-sm text-gray-200 whitespace-pre-wrap break-words">
          {reasonTarget?.rejection_reason ?? "No reason was recorded."}
        </div>
      </DismissibleModal>

      {/* Preview user experience */}
      <DismissibleModal
        isOpen={!!previewTarget}
        onClose={() => {
          setPreviewTarget(null);
          setPreviewData(null);
        }}
        className="max-w-2xl"
        ariaLabelledBy={previewHeadingId}
        unstyled
      >
        <div className="p-6 pr-12">
          <h3 id={previewHeadingId} className="text-xl font-semibold mb-1">
            User Preview
          </h3>
          <p className="text-gray-400 text-sm mb-5">
            What server admins will see when viewing this integration
          </p>

          {previewLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
            </div>
          ) : previewData ? (
            <div className="flex flex-col gap-5">
              {/* About section */}
              <div className="bg-gray-900 rounded-lg p-4">
                <h4 className="text-sm font-medium text-gray-300 uppercase tracking-wide mb-3">
                  About
                </h4>
                <p className="text-gray-300 text-sm mb-3">{previewData.description}</p>
                <div className="flex flex-col gap-2 text-xs text-gray-400">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500 w-24 shrink-0">Webhook</span>
                    <span className="font-mono truncate">{previewData.webhook_url}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500 w-24 shrink-0">Privacy policy</span>
                    <span>
                      {previewData.privacy_policy_url ? (
                        <a
                          href={previewData.privacy_policy_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-blue-400 hover:text-blue-300 break-all"
                        >
                          {previewData.privacy_policy_url}
                        </a>
                      ) : (
                        <span className="text-gray-600">Not provided</span>
                      )}
                    </span>
                  </div>
                </div>
              </div>

              {/* Placeholders section */}
              <div className="bg-gray-900 rounded-lg p-4">
                <h4 className="text-sm font-medium text-gray-300 uppercase tracking-wide mb-3">
                  Placeholders
                </h4>
                <p className="text-gray-500 text-xs mb-2">Available for use in welcome messages</p>
                {previewData.placeholders && previewData.placeholders.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {previewData.placeholders.map((p) => (
                      <span
                        key={p.name}
                        className="bg-gray-700 text-gray-200 text-xs px-2 py-1 rounded font-mono"
                      >
                        %{p.name}%
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-600 text-sm">No placeholders defined.</p>
                )}
              </div>

              {/* Secrets/inputs section */}
              <div className="bg-gray-900 rounded-lg p-4">
                <h4 className="text-sm font-medium text-gray-300 uppercase tracking-wide mb-3">
                  Required inputs
                </h4>
                <p className="text-gray-500 text-xs mb-2">
                  Server admins must provide these when activating
                </p>
                {previewData.secrets && previewData.secrets.length > 0 ? (
                  <div className="flex flex-col gap-3">
                    {previewData.secrets.map((secret) => (
                      <div key={secret.name} className="border border-gray-700 rounded p-3">
                        <div className="font-medium text-sm text-gray-200">{secret.name}</div>
                        {secret.description && (
                          <p className="text-gray-500 text-xs mt-1">{secret.description}</p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-600 text-sm">
                    No inputs required. Users can activate without providing any credentials.
                  </p>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </DismissibleModal>
    </div>
  );
};

export default AdminIntegrationsPage;
