import { useState, useEffect, useCallback, useMemo } from "react";
import { apiClient } from "@/lib/api";
import { toast } from "sonner";
import Button from "@/components/Button";
import TextInput from "@/components/TextInput";
import NumberInput from "@/components/NumberInput";
import Select from "@/components/Select";
import Collapsible from "@/components/Collapsible";
import ConfirmModal from "@/components/modals/ConfirmModal";
import Pagination from "@/components/Pagination";
import SearchInput from "@/components/SearchInput";
import Table from "@/components/Table";
import TableSkeleton from "@/components/skeletons/TableSkeleton";
import { useAuthStore } from "@/stores/auth";
import { isAtLeast } from "@/lib/admin-tier";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronDown, faChevronRight } from "@fortawesome/free-solid-svg-icons";
import type { AdminAffiliateCode, AdminFlaggedReferral, AffiliateReferral } from "@/types";
import SortableHeaderCell from "@/components/SortableHeaderCell";
import { useTableSort } from "@/hooks/useTableSort";
import { toTime, type SortColumn } from "@/lib/table-sort";
import { useUrlSearch } from "@/hooks/useUrlSearch";
import { matchesSearch } from "@/lib/search";

const CODES_PER_PAGE = 25;
const SEARCH_FETCH_LIMIT = 500;

type FlaggedSortKey = "id" | "affiliate" | "referred" | "tier" | "status" | "created_at";

const FLAGGED_SORT_COLUMNS: Record<FlaggedSortKey, SortColumn<AdminFlaggedReferral>> = {
  id: { value: (r) => r.id, defaultDir: "asc" },
  affiliate: { value: (r) => r.affiliate_user_id, defaultDir: "asc" },
  referred: { value: (r) => r.referred_user_id, defaultDir: "asc" },
  tier: { value: (r) => r.referred_tier, defaultDir: "asc" },
  status: { value: (r) => r.status, defaultDir: "asc" },
  created_at: { value: (r) => toTime(r.created_at) },
};

const AFFILIATE_STATUS_DOTS: Record<string, string> = {
  pending: "#E17100",
  active: "#00A63E",
  revoked: "#E7000B",
};

function AffiliateStatusBadge({ status }: { status: string }) {
  const colours: Record<string, string> = {
    pending: "bg-amber-600",
    active: "bg-green-600",
    revoked: "bg-red-600",
  };

  return (
    <span
      className={`inline-block text-white text-xs px-2 py-0.5 rounded capitalize ${colours[status] ?? "bg-gray-600"}`}
    >
      {status}
    </span>
  );
}

function ReferralStatusBadge({ status }: { status: string }) {
  const colours: Record<string, string> = {
    pending: "bg-amber-600",
    redeemable: "bg-green-600",
    redeemed: "bg-blue-600",
    voided: "bg-red-600",
    flagged: "bg-red-500",
  };

  return (
    <span
      className={`inline-block text-white text-xs px-2 py-0.5 rounded capitalize ${colours[status] ?? "bg-gray-600"}`}
    >
      {status}
    </span>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function truncateId(id: string): string {
  return id.length > 13 ? id.slice(0, 13) + "..." : id;
}

function ExpandedDetail({
  code,
  isOwner,
  onApprove,
  onRevoke,
  onEditRates,
  onEditCode,
}: {
  code: AdminAffiliateCode;
  isOwner: boolean;
  onApprove: (id: string) => void;
  onRevoke: (id: string) => void;
  onEditRates: (code: AdminAffiliateCode) => void;
  onEditCode: (code: AdminAffiliateCode) => void;
}) {
  const [referrals, setReferrals] = useState<AffiliateReferral[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchReferrals = async () => {
      try {
        const res = await apiClient.admin.affiliate.listReferrals(code.id, 1, 10);
        setReferrals(res.data.referrals);
      } catch {
        setReferrals([]);
      } finally {
        setLoading(false);
      }
    };
    fetchReferrals();
  }, [code.id]);

  return (
    <div className="bg-gray-900/80 px-6 py-4 space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div className="bg-gray-800 rounded-lg p-3">
          <p className="text-xs text-gray-400">Total Referrals</p>
          <p className="text-lg font-bold text-white">{code.total_referrals}</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-3">
          <p className="text-xs text-gray-400">Credits Redeemed</p>
          <p className="text-lg font-bold text-white">
            {code.redeemed_credits} <span className="text-sm font-normal text-gray-400">/ 365</span>
          </p>
        </div>
        <div className="bg-gray-800 rounded-lg p-3">
          <p className="text-xs text-gray-400">Rates</p>
          <p className="text-lg font-bold text-white">
            {(code.discount_basis_points / 100).toFixed(0)}%{" "}
            <span className="text-sm font-normal text-gray-400">discount</span> /{" "}
            {code.credit_percentage != null ? (
              <>
                {code.credit_percentage}%{" "}
                <span className="text-sm font-normal text-gray-400">credit (override)</span>
              </>
            ) : (
              <span className="text-sm font-normal text-gray-400">credit: tier default</span>
            )}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="text-xs text-gray-400">
          Code: <span className="font-mono text-white">{code.code}</span>
        </div>
        <div className="text-xs text-gray-400">
          User ID: <span className="font-mono text-white">{code.user_id}</span>
        </div>
        {code.approved_at && (
          <div className="text-xs text-gray-400">Approved: {formatDate(code.approved_at)}</div>
        )}
        {code.revoked_at && (
          <div className="text-xs text-gray-400">Revoked: {formatDate(code.revoked_at)}</div>
        )}
      </div>

      {isOwner && (
        <div className="flex items-center gap-2">
          {code.status === "pending" && (
            <Button variant="success" size="sm" onClick={() => onApprove(code.id)}>
              Approve<span className="sr-only"> for {code.code}</span>
            </Button>
          )}
          {(code.status === "active" || code.status === "pending") && (
            <Button variant="danger" size="sm" onClick={() => onRevoke(code.id)}>
              Revoke<span className="sr-only"> for {code.code}</span>
            </Button>
          )}
          {code.status !== "revoked" && (
            <>
              <Button variant="secondary" size="sm" onClick={() => onEditRates(code)}>
                Edit Rates<span className="sr-only"> for {code.code}</span>
              </Button>
              <Button variant="secondary" size="sm" onClick={() => onEditCode(code)}>
                Edit Code<span className="sr-only"> for {code.code}</span>
              </Button>
            </>
          )}
        </div>
      )}

      {code.total_referrals > 0 && (
        <div>
          <h4 className="text-sm font-medium text-gray-300 mb-2">Recent Referrals</h4>
          {loading ? (
            <p className="text-xs text-gray-500">Loading...</p>
          ) : referrals.length === 0 ? (
            <p className="text-xs text-gray-500">No referral details available.</p>
          ) : (
            <Table variant="compact">
              <Table.Head>
                <Table.Row className="text-gray-500 uppercase text-xs">
                  <Table.HeaderCell className="px-3 py-2">Tier</Table.HeaderCell>
                  <Table.HeaderCell className="px-3 py-2">Purchased</Table.HeaderCell>
                  <Table.HeaderCell className="px-3 py-2">Credit</Table.HeaderCell>
                  <Table.HeaderCell className="px-3 py-2">Status</Table.HeaderCell>
                  <Table.HeaderCell className="px-3 py-2">Date</Table.HeaderCell>
                </Table.Row>
              </Table.Head>
              <Table.Body>
                {referrals.map((ref) => (
                  <Table.Row key={ref.id} className="border-t border-gray-800 text-xs">
                    <Table.Cell className="px-3 py-2 capitalize">{ref.referred_tier}</Table.Cell>
                    <Table.Cell className="px-3 py-2">{ref.purchased_days} days</Table.Cell>
                    <Table.Cell className="px-3 py-2">{ref.credit_days} days</Table.Cell>
                    <Table.Cell className="px-3 py-2">
                      <ReferralStatusBadge status={ref.status} />
                    </Table.Cell>
                    <Table.Cell className="px-3 py-2">{formatDate(ref.created_at)}</Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          )}
        </div>
      )}
    </div>
  );
}

export default function AdminAffiliatePage() {
  const { user } = useAuthStore();
  const isOwner = isAtLeast(user?.admin_tier ?? "", "owner");

  const [codes, setCodes] = useState<AdminAffiliateCode[]>([]);
  const [codesTotal, setCodesTotal] = useState(0);
  const [codesPage, setCodesPage] = useState(1);
  const [codesLoading, setCodesLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const codesSearch = useUrlSearch("q");
  const flaggedSearch = useUrlSearch("flagged_q");

  const [flagged, setFlagged] = useState<AdminFlaggedReferral[]>([]);
  const [flaggedLoading, setFlaggedLoading] = useState(true);

  const [showVoidModal, setShowVoidModal] = useState(false);
  const [voidTarget, setVoidTarget] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState("");

  const [editingCode, setEditingCode] = useState<AdminAffiliateCode | null>(null);
  const [editDiscount, setEditDiscount] = useState(0);
  const [editCredit, setEditCredit] = useState<number | null>(0);

  const [editCodeTarget, setEditCodeTarget] = useState<AdminAffiliateCode | null>(null);
  const [editCodeValue, setEditCodeValue] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  const [createUserId, setCreateUserId] = useState("");
  const [createCode, setCreateCode] = useState("");
  const [createDiscount, setCreateDiscount] = useState(500);
  const [createCredit, setCreateCredit] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);

  const fetchCodes = useCallback(async () => {
    setCodesLoading(true);
    try {
      const status = statusFilter === "all" ? undefined : statusFilter;
      const res = await apiClient.admin.affiliate.listCodes(
        status,
        codesSearch.isSearching ? 1 : codesPage,
        codesSearch.isSearching ? SEARCH_FETCH_LIMIT : CODES_PER_PAGE,
      );
      let list = res.data.codes ?? [];
      if (codesSearch.isSearching) {
        list = list.filter((code) =>
          matchesSearch(
            codesSearch.debouncedSearch,
            code.code,
            code.username,
            code.user_id,
            code.status,
          ),
        );
      }
      setCodes(list);
      setCodesTotal(codesSearch.isSearching ? list.length : (res.data.total ?? 0));
    } catch {
      // Interceptor handles error display
    } finally {
      setCodesLoading(false);
    }
  }, [statusFilter, codesPage, codesSearch.debouncedSearch, codesSearch.isSearching]);

  useEffect(() => {
    if (codesSearch.isSearching && codesPage !== 1) {
      setCodesPage(1);
    }
  }, [codesSearch.debouncedSearch, codesSearch.isSearching, codesPage]);

  const fetchFlagged = useCallback(async () => {
    setFlaggedLoading(true);
    try {
      const res = await apiClient.admin.affiliate.listFlagged();
      setFlagged(res.data.referrals);
    } catch {
      // Interceptor handles error display
    } finally {
      setFlaggedLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCodes();
  }, [fetchCodes]);

  useEffect(() => {
    if (isOwner) {
      fetchFlagged();
    } else {
      setFlaggedLoading(false);
    }
  }, [fetchFlagged, isOwner]);

  const handleApprove = async (codeId: string) => {
    try {
      await apiClient.admin.affiliate.approve(codeId);
      toast.success("Affiliate code approved.");
      await fetchCodes();
    } catch {
      // Interceptor handles error display
    }
  };

  const handleRevoke = async (codeId: string) => {
    try {
      await apiClient.admin.affiliate.revoke(codeId);
      toast.success("Affiliate code revoked.");
      await fetchCodes();
    } catch {
      // Interceptor handles error display
    }
  };

  const handleUpdateRates = async () => {
    if (!editingCode) return;
    try {
      await apiClient.admin.affiliate.updateRates(editingCode.id, {
        discount_basis_points: editDiscount,
        credit_percentage: editCredit,
      });
      toast.success("Rates updated successfully.");
      setEditingCode(null);
      await fetchCodes();
    } catch {
      // Interceptor handles error display
    }
  };

  const openEditCode = (code: AdminAffiliateCode) => {
    setEditCodeTarget(code);
    setEditCodeValue(code.code);
  };

  const handleUpdateCode = async () => {
    if (!editCodeTarget) return;
    try {
      await apiClient.admin.affiliate.updateCode(editCodeTarget.id, editCodeValue.trim());
      toast.success("Affiliate code updated.");
      setEditCodeTarget(null);
      await fetchCodes();
    } catch {
      // Interceptor handles error display
    }
  };

  const handleCreate = async () => {
    setCreating(true);
    try {
      await apiClient.admin.affiliate.createCode({
        user_id: createUserId.trim(),
        code: createCode.trim(),
        discount_basis_points: createDiscount,
        credit_percentage: createCredit,
      });
      toast.success("Affiliate code created.");
      setCreateOpen(false);
      setCreateUserId("");
      setCreateCode("");
      setCreateDiscount(500);
      setCreateCredit(null);
      await fetchCodes();
    } catch {
      // Interceptor handles error display
    } finally {
      setCreating(false);
    }
  };

  const handleVoid = async () => {
    if (!voidTarget) return;
    try {
      await apiClient.admin.affiliate.voidReferral(voidTarget, voidReason);
      toast.success("Referral voided.");
      setShowVoidModal(false);
      setVoidTarget(null);
      setVoidReason("");
      await fetchFlagged();
    } catch {
      // Interceptor handles error display
    }
  };

  const openEditRates = (code: AdminAffiliateCode) => {
    setEditingCode(code);
    setEditDiscount(code.discount_basis_points);
    setEditCredit(code.credit_percentage);
  };

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const codesTotalPages = useMemo(
    () => (codesSearch.isSearching ? 1 : Math.max(1, Math.ceil(codesTotal / CODES_PER_PAGE))),
    [codesSearch.isSearching, codesTotal],
  );

  const filteredFlagged = useMemo(() => {
    if (!flaggedSearch.isSearching) return flagged;
    return flagged.filter((ref) =>
      matchesSearch(
        flaggedSearch.debouncedSearch,
        ref.id,
        ref.affiliate_user_id,
        ref.referred_user_id,
        ref.referred_tier,
        ref.status,
        ref.voided_reason,
      ),
    );
  }, [flagged, flaggedSearch.debouncedSearch, flaggedSearch.isSearching]);

  const flaggedSort = useTableSort(filteredFlagged, FLAGGED_SORT_COLUMNS, {
    initialSort: { key: "created_at", dir: "desc" },
    persistKey: "admin-flagged-referrals",
  });

  return (
    <div>
      <header className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-semibold mb-2 text-center">
          Affiliate Management
        </h1>
        <p className="text-center text-gray-400 text-sm sm:text-base">
          Manage affiliate codes and review flagged referrals
        </p>
      </header>

      {/* Create Code Section */}
      {isOwner && (
        <section className="mb-10">
          <Collapsible title="Create Affiliate Code" open={createOpen} onOpenChange={setCreateOpen}>
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4">
                <TextInput
                  label="User ID"
                  value={createUserId}
                  onChange={setCreateUserId}
                  placeholder="Discord user ID"
                />
                <TextInput
                  label="Code"
                  value={createCode}
                  onChange={setCreateCode}
                  placeholder="Unique affiliate code"
                  maxLength={6}
                />
              </div>
              <NumberInput
                label="Discount (basis points)"
                value={createDiscount}
                min={0}
                max={5000}
                onChange={setCreateDiscount}
              />
              <div>
                <p className="text-sm text-gray-400 mb-1">
                  Credit percentage:{" "}
                  {createCredit === null ? (
                    <span className="text-white">Tier default (5% / 10%)</span>
                  ) : (
                    <span className="text-white">{createCredit}% (override)</span>
                  )}
                </p>
                {createCredit !== null ? (
                  <div className="flex items-center gap-3">
                    <NumberInput
                      label=""
                      value={createCredit}
                      min={0}
                      max={100}
                      onChange={setCreateCredit}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setCreateCredit(null)}
                      className="whitespace-nowrap"
                    >
                      Use default
                    </Button>
                  </div>
                ) : (
                  <Button variant="ghost" size="sm" onClick={() => setCreateCredit(10)}>
                    Set custom override
                  </Button>
                )}
              </div>
              <Button
                variant="primary"
                onClick={handleCreate}
                disabled={creating || !createUserId.trim() || !createCode.trim()}
              >
                {creating ? "Creating..." : "Create"}
              </Button>
            </div>
          </Collapsible>
        </section>
      )}

      {/* Affiliate Codes Section */}
      <section className="mb-10">
        <div className="flex flex-col gap-3 mb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <h2 className="text-xl font-medium">Affiliate Codes</h2>
            <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
              <SearchInput
                value={codesSearch.searchQuery}
                onChange={codesSearch.setSearchQuery}
                placeholder="Search codes..."
                label="Search by code, username, or user ID"
                className="w-full sm:w-56"
              />
              <Select
                value={statusFilter}
                options={[
                  { key: "all", label: "All statuses" },
                  { key: "pending", label: "Pending", color: AFFILIATE_STATUS_DOTS.pending },
                  { key: "active", label: "Active", color: AFFILIATE_STATUS_DOTS.active },
                  { key: "revoked", label: "Revoked", color: AFFILIATE_STATUS_DOTS.revoked },
                ]}
                onChange={(v) => {
                  setStatusFilter(v ?? "all");
                  setCodesPage(1);
                  setExpandedId(null);
                }}
                placeholder="All statuses"
                className="w-full sm:w-48"
              />
            </div>
          </div>
        </div>

        {codesLoading ? (
          <TableSkeleton rows={4} columns={6} />
        ) : codes.length === 0 ? (
          <p className="text-gray-400 text-center py-8">
            {codesSearch.debouncedSearch
              ? `No affiliate codes match "${codesSearch.debouncedSearch}".`
              : "No affiliate codes found."}
          </p>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block">
              <Table variant="compact">
                <Table.Head>
                  <Table.Row>
                    <Table.HeaderCell className="px-4 py-3 w-8"></Table.HeaderCell>
                    <Table.HeaderCell>Code</Table.HeaderCell>
                    <Table.HeaderCell>User</Table.HeaderCell>
                    <Table.HeaderCell>Status</Table.HeaderCell>
                    <Table.HeaderCell>Referrals</Table.HeaderCell>
                    <Table.HeaderCell>Redeemed</Table.HeaderCell>
                    <Table.HeaderCell>Created</Table.HeaderCell>
                  </Table.Row>
                </Table.Head>
                <Table.Body>
                  {codes.map((code) => (
                    <>
                      <Table.Row
                        key={code.id}
                        className={`border-b border-gray-700 cursor-pointer transition-colors ${expandedId === code.id ? "bg-gray-800/70" : "hover:bg-gray-800/50"}`}
                        onClick={() => toggleExpand(code.id)}
                      >
                        <Table.Cell className="px-4 py-3 text-gray-400">
                          <FontAwesomeIcon
                            icon={expandedId === code.id ? faChevronDown : faChevronRight}
                            className="text-xs"
                          />
                        </Table.Cell>
                        <Table.Cell className="px-4 py-3 font-mono text-xs">{code.code}</Table.Cell>
                        <Table.Cell>
                          <div className="flex items-center gap-2">
                            {code.avatar_url && (
                              <img src={code.avatar_url} alt="" className="w-6 h-6 rounded-full" />
                            )}
                            <span className="text-sm">{code.username}</span>
                          </div>
                        </Table.Cell>
                        <Table.Cell>
                          <AffiliateStatusBadge status={code.status} />
                        </Table.Cell>
                        <Table.Cell>{code.total_referrals}</Table.Cell>
                        <Table.Cell className="px-4 py-3 text-xs">
                          {code.redeemed_credits > 0 ? (
                            <span>{code.redeemed_credits} / 365</span>
                          ) : (
                            <span className="text-gray-500">None</span>
                          )}
                        </Table.Cell>
                        <Table.Cell>{formatDate(code.created_at)}</Table.Cell>
                      </Table.Row>
                      {expandedId === code.id && (
                        <Table.Row key={`${code.id}-detail`} className="">
                          <Table.Cell colSpan={7} className="p-0">
                            <ExpandedDetail
                              code={code}
                              isOwner={isOwner}
                              onApprove={handleApprove}
                              onRevoke={handleRevoke}
                              onEditRates={openEditRates}
                              onEditCode={openEditCode}
                            />
                          </Table.Cell>
                        </Table.Row>
                      )}
                    </>
                  ))}
                </Table.Body>
              </Table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden space-y-3">
              {codes.map((code) => (
                <div key={code.id} className="bg-gray-800 rounded-lg overflow-hidden">
                  <Button
                    type="button"
                    className="w-full p-4 text-left justify-start block"
                    onClick={() => toggleExpand(code.id)}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-2">
                        <FontAwesomeIcon
                          icon={expandedId === code.id ? faChevronDown : faChevronRight}
                          className="text-xs text-gray-400"
                        />
                        <span className="font-mono text-sm text-white">{code.code}</span>
                      </div>
                      <AffiliateStatusBadge status={code.status} />
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-400 mt-2 ml-5">
                      {code.avatar_url && (
                        <img src={code.avatar_url} alt="" className="w-5 h-5 rounded-full" />
                      )}
                      {code.username}
                    </div>
                    <div className="text-xs text-gray-400 mt-1 ml-5">
                      {code.total_referrals} referrals &middot; Created{" "}
                      {formatDate(code.created_at)}
                    </div>
                  </Button>
                  {expandedId === code.id && (
                    <ExpandedDetail
                      code={code}
                      isOwner={isOwner}
                      onApprove={handleApprove}
                      onRevoke={handleRevoke}
                      onEditRates={openEditRates}
                      onEditCode={openEditCode}
                    />
                  )}
                </div>
              ))}
            </div>
            {!codesSearch.isSearching && (
              <Pagination
                variant="full"
                page={codesPage}
                totalPages={codesTotalPages}
                onChange={setCodesPage}
                disabled={codesLoading}
              />
            )}
          </>
        )}
      </section>

      {/* Flagged Referrals Section */}
      {isOwner && (
        <section>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <h2 className="text-xl font-medium">Flagged Referrals</h2>
            <SearchInput
              value={flaggedSearch.searchQuery}
              onChange={flaggedSearch.setSearchQuery}
              placeholder="Search flagged referrals..."
              label="Search by ID, user ID, tier, or status"
              className="w-full sm:w-72"
            />
          </div>

          {flaggedLoading ? (
            <TableSkeleton rows={3} columns={7} />
          ) : filteredFlagged.length === 0 ? (
            <p className="text-gray-400 text-center py-8">
              {flaggedSearch.debouncedSearch
                ? `No flagged referrals match "${flaggedSearch.debouncedSearch}".`
                : "No flagged referrals."}
            </p>
          ) : (
            <div className="hidden md:block">
              <Table variant="compact">
                <Table.Head>
                  <Table.Row>
                    <SortableHeaderCell sort={flaggedSort} sortKey="id" label="ID" />
                    <SortableHeaderCell sort={flaggedSort} sortKey="affiliate" label="Affiliate" />
                    <SortableHeaderCell
                      sort={flaggedSort}
                      sortKey="referred"
                      label="Referred User"
                    />
                    <SortableHeaderCell sort={flaggedSort} sortKey="tier" label="Tier" />
                    <SortableHeaderCell sort={flaggedSort} sortKey="status" label="Status" />
                    <SortableHeaderCell sort={flaggedSort} sortKey="created_at" label="Date" />
                    <Table.HeaderCell>Actions</Table.HeaderCell>
                  </Table.Row>
                </Table.Head>
                <Table.Body>
                  {flaggedSort.sortedRows.map((ref) => (
                    <Table.Row key={ref.id}>
                      <Table.Cell className="px-4 py-3 font-mono text-xs">
                        {truncateId(ref.id)}
                      </Table.Cell>
                      <Table.Cell className="px-4 py-3 font-mono text-xs">
                        {truncateId(ref.affiliate_user_id)}
                      </Table.Cell>
                      <Table.Cell className="px-4 py-3 font-mono text-xs">
                        {truncateId(ref.referred_user_id)}
                      </Table.Cell>
                      <Table.Cell className="px-4 py-3 capitalize">{ref.referred_tier}</Table.Cell>
                      <Table.Cell>
                        <ReferralStatusBadge status={ref.status} />
                      </Table.Cell>
                      <Table.Cell>{formatDate(ref.created_at)}</Table.Cell>
                      <Table.Cell>
                        {ref.status !== "voided" && (
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => {
                              setVoidTarget(ref.id);
                              setVoidReason("");
                              setShowVoidModal(true);
                            }}
                          >
                            Void
                          </Button>
                        )}
                        {ref.voided_reason && (
                          <span className="text-xs text-gray-500 ml-2">{ref.voided_reason}</span>
                        )}
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table>
            </div>
          )}
        </section>
      )}

      {/* Edit Rates Modal */}
      <ConfirmModal
        isOpen={!!editingCode}
        title="Edit Affiliate Rates"
        message={
          <div className="space-y-4">
            <p className="text-sm text-gray-400">
              Update the discount and credit rates for{" "}
              <strong className="text-white">{editingCode?.code}</strong>.
            </p>
            <NumberInput
              label="Discount (basis points)"
              value={editDiscount}
              min={0}
              max={5000}
              onChange={setEditDiscount}
            />
            {editCredit !== null ? (
              <div className="space-y-2">
                <NumberInput
                  label="Credit percentage (override)"
                  value={editCredit}
                  min={0}
                  max={100}
                  onChange={setEditCredit}
                />
                <Button variant="ghost" size="sm" onClick={() => setEditCredit(null)}>
                  Reset to tier default (5% standard / 10% premium)
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-gray-400">
                  Credit percentage: <span className="text-white">Using tier default</span>
                  <span className="text-gray-500 ml-1">(5% standard / 10% premium)</span>
                </p>
                <Button variant="ghost" size="sm" onClick={() => setEditCredit(10)}>
                  Set a custom override
                </Button>
              </div>
            )}
          </div>
        }
        confirmText="Save Changes"
        cancelText="Cancel"
        confirmVariant="primary"
        onConfirm={handleUpdateRates}
        onCancel={() => setEditingCode(null)}
      />

      {/* Edit Code Modal */}
      <ConfirmModal
        isOpen={!!editCodeTarget}
        title="Edit Affiliate Code"
        message={
          <div className="space-y-4">
            <p className="text-sm text-gray-400">
              Change the affiliate code for{" "}
              <strong className="text-white">{editCodeTarget?.code}</strong>. The Polar discount
              will be recreated with the new code.
            </p>
            <TextInput
              label="New Code"
              value={editCodeValue}
              onChange={setEditCodeValue}
              placeholder="3-6 alphanumeric characters"
              maxLength={6}
            />
          </div>
        }
        confirmText="Update Code"
        cancelText="Cancel"
        confirmVariant="primary"
        onConfirm={handleUpdateCode}
        onCancel={() => setEditCodeTarget(null)}
      />

      {/* Void Referral Modal */}
      <ConfirmModal
        isOpen={showVoidModal}
        title="Void Referral"
        message={
          <div className="space-y-3">
            <p>
              Are you sure you want to void this referral? This will prevent the affiliate from
              redeeming credit for this referral.
            </p>
            <TextInput
              label="Reason"
              value={voidReason}
              onChange={setVoidReason}
              placeholder="Reason for voiding..."
            />
          </div>
        }
        confirmText="Void Referral"
        cancelText="Cancel"
        confirmVariant="danger"
        onConfirm={handleVoid}
        onCancel={() => {
          setShowVoidModal(false);
          setVoidTarget(null);
          setVoidReason("");
        }}
      />
    </div>
  );
}
