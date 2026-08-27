import { useState, useEffect, useCallback, useMemo } from "react";
import { apiClient } from "@/lib/api";
import Button from "@/components/Button";
import Collapsible from "@/components/Collapsible";
import NumberInput from "@/components/NumberInput";
import Pagination from "@/components/Pagination";
import SearchInput from "@/components/SearchInput";
import Select from "@/components/Select";
import Table from "@/components/Table";
import type { AdminEntitlement, PremiumKeyEntry, SubscriptionSku } from "@/types";
import TableSkeleton from "@/components/skeletons/TableSkeleton";
import { useAuthStore } from "@/stores/auth";
import { isAtLeast } from "@/lib/admin-tier";
import { useUrlSearch } from "@/hooks/useUrlSearch";
import { matchesSearch } from "@/lib/search";

const SEARCH_FETCH_LIMIT = 500;

interface PaginatedEntitlements {
  entitlements: AdminEntitlement[];
  total: number;
  page: number;
  per_page: number;
}

interface PaginatedKeys {
  keys: PremiumKeyEntry[];
  total: number;
  page: number;
  per_page: number;
}

function SourceBadge({ source }: { source: string }) {
  const colours: Record<string, string> = {
    discord: "bg-[#5865F2]",
    patreon: "bg-[#FF424D]",
    voting: "bg-amber-500",
    key: "bg-blue-600",
  };

  return (
    <span
      className={`inline-block text-white text-xs px-2 py-0.5 rounded capitalize ${colours[source] ?? "bg-gray-600"}`}
    >
      {source}
    </span>
  );
}

function StatusBadge({ expiresAt }: { expiresAt?: string }) {
  if (!expiresAt) {
    return (
      <span className="inline-block bg-blue-600 text-white text-xs px-2 py-0.5 rounded">
        Permanent
      </span>
    );
  }

  const isExpired = new Date(expiresAt) < new Date();
  return (
    <span
      className={`inline-block text-white text-xs px-2 py-0.5 rounded ${isExpired ? "bg-red-600" : "bg-green-600"}`}
    >
      {isExpired ? "Expired" : "Active"}
    </span>
  );
}

function KeyStatusBadge({ isUsed }: { isUsed: boolean }) {
  return (
    <span
      className={`inline-block text-white text-xs px-2 py-0.5 rounded ${isUsed ? "bg-amber-600" : "bg-green-600"}`}
    >
      {isUsed ? "Redeemed" : "Available"}
    </span>
  );
}

function formatDuration(nanoseconds: number): string {
  const days = Math.floor(nanoseconds / (24 * 60 * 60 * 1e9));
  if (days >= 365) return `${Math.floor(days / 365)}y`;
  if (days >= 30) return `${Math.floor(days / 30)}mo`;
  return `${days}d`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function truncateUuid(uuid: string): string {
  return uuid.length > 13 ? uuid.slice(0, 13) + "..." : uuid;
}

export default function PremiumPage() {
  const { user } = useAuthStore();
  const isOwner = isAtLeast(user?.admin_tier ?? "", "owner");

  // Entitlements state
  const [entitlements, setEntitlements] = useState<PaginatedEntitlements | null>(null);
  const [entPage, setEntPage] = useState(1);
  const [entLoading, setEntLoading] = useState(true);
  const entSearch = useUrlSearch("ent_q");

  // Keys state
  const [keys, setKeys] = useState<PaginatedKeys | null>(null);
  const [keysPage, setKeysPage] = useState(1);
  const [keysLoading, setKeysLoading] = useState(true);
  const keysSearch = useUrlSearch("keys_q");

  // Generate keys state
  const [genOpen, setGenOpen] = useState(false);
  const [skus, setSkus] = useState<SubscriptionSku[]>([]);
  const [skusLoading, setSkusLoading] = useState(false);
  const [selectedSku, setSelectedSku] = useState("");
  const [lengthDays, setLengthDays] = useState(30);
  const [amount, setAmount] = useState(1);
  const [generating, setGenerating] = useState(false);
  const [generatedKeys, setGeneratedKeys] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  const fetchEntitlements = useCallback(
    async (page: number) => {
      setEntLoading(true);
      try {
        const res = await apiClient.admin.entitlements.list(
          entSearch.isSearching ? 1 : page,
          entSearch.isSearching ? SEARCH_FETCH_LIMIT : 25,
        );
        let list = res.data.entitlements ?? [];
        if (entSearch.isSearching) {
          list = list.filter((ent) =>
            matchesSearch(
              entSearch.debouncedSearch,
              ent.user_id,
              ent.source,
              ent.sku_label,
              ent.tier,
            ),
          );
        }
        setEntitlements({
          ...res.data,
          entitlements: list,
          total: entSearch.isSearching ? list.length : res.data.total,
          page: entSearch.isSearching ? 1 : res.data.page,
        });
      } catch {
        // Error handled by interceptor
      } finally {
        setEntLoading(false);
      }
    },
    [entSearch.debouncedSearch, entSearch.isSearching],
  );

  const fetchKeys = useCallback(
    async (page: number) => {
      setKeysLoading(true);
      try {
        const res = await apiClient.admin.premiumKeys.list(
          keysSearch.isSearching ? 1 : page,
          keysSearch.isSearching ? SEARCH_FETCH_LIMIT : 25,
        );
        let list = res.data.keys ?? [];
        if (keysSearch.isSearching) {
          list = list.filter((key) =>
            matchesSearch(
              keysSearch.debouncedSearch,
              key.key,
              key.sku_label,
              key.tier,
              key.guild_id,
              key.activated_by,
            ),
          );
        }
        setKeys({
          ...res.data,
          keys: list,
          total: keysSearch.isSearching ? list.length : res.data.total,
          page: keysSearch.isSearching ? 1 : res.data.page,
        });
      } catch {
        // Error handled by interceptor
      } finally {
        setKeysLoading(false);
      }
    },
    [keysSearch.debouncedSearch, keysSearch.isSearching],
  );

  useEffect(() => {
    if (entSearch.isSearching && entPage !== 1) {
      setEntPage(1);
    }
  }, [entSearch.debouncedSearch, entSearch.isSearching, entPage]);

  useEffect(() => {
    if (keysSearch.isSearching && keysPage !== 1) {
      setKeysPage(1);
    }
  }, [keysSearch.debouncedSearch, keysSearch.isSearching, keysPage]);

  useEffect(() => {
    if (isOwner) {
      fetchEntitlements(entPage);
    } else {
      setEntLoading(false);
    }
  }, [entPage, fetchEntitlements, isOwner]);

  useEffect(() => {
    fetchKeys(keysPage);
  }, [keysPage, fetchKeys]);

  const entTotalPages = useMemo(
    () =>
      entitlements
        ? entSearch.isSearching
          ? 1
          : Math.max(1, Math.ceil(entitlements.total / entitlements.per_page))
        : 1,
    [entitlements, entSearch.isSearching],
  );

  const keysTotalPages = useMemo(
    () =>
      keys ? (keysSearch.isSearching ? 1 : Math.max(1, Math.ceil(keys.total / keys.per_page))) : 1,
    [keys, keysSearch.isSearching],
  );

  const fetchSkus = useCallback(async () => {
    setSkusLoading(true);
    try {
      const res = await apiClient.admin.skus.list();
      setSkus(
        res.data.map((s) => ({
          ...s,
          tier: s.tier ?? "",
          priority: s.priority ?? 0,
          is_global: s.is_global ?? false,
        })),
      );
    } catch {
      // Error handled by interceptor
    } finally {
      setSkusLoading(false);
    }
  }, []);

  useEffect(() => {
    if (genOpen && skus.length === 0) {
      fetchSkus();
    }
  }, [genOpen, skus.length, fetchSkus]);

  const handleGenerate = async () => {
    setGenerating(true);
    setGeneratedKeys([]);
    setCopied(false);
    try {
      const res = await apiClient.admin.premiumKeys.generate({
        sku_id: selectedSku,
        length: lengthDays,
        amount,
      });
      setGeneratedKeys(res.data.keys);
      fetchKeys(keysPage);
    } catch {
      // Error handled by interceptor
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(generatedKeys.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div>
      <header className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-semibold mb-2 text-center">Premium Monitoring</h1>
        <p className="text-center text-gray-400 text-sm sm:text-base">
          {isOwner ? "Monitor entitlements and premium keys" : "Monitor premium keys"}
        </p>
      </header>

      {/* Generate Keys Section */}
      <section className="mb-10">
        <Collapsible title="Generate Premium Keys" open={genOpen} onOpenChange={setGenOpen}>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4">
              <Select
                label="SKU"
                value={selectedSku || null}
                options={skus.map((sku) => ({ key: sku.id, label: `${sku.label} (${sku.tier})` }))}
                onChange={(v) => setSelectedSku(v ?? "")}
                disabled={skusLoading}
                placeholder="Select a SKU..."
              />

              <NumberInput
                label="Length (days)"
                value={lengthDays}
                min={1}
                onChange={setLengthDays}
              />

              <NumberInput label="Amount" value={amount} min={1} max={50} onChange={setAmount} />
            </div>

            <Button
              variant="primary"
              onClick={handleGenerate}
              disabled={generating || !selectedSku}
            >
              {generating ? "Generating..." : "Generate"}
            </Button>

            {generatedKeys.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-green-400">
                    Generated {generatedKeys.length} key
                    {generatedKeys.length !== 1 ? "s" : ""}:
                  </span>
                  <Button variant="secondary" size="sm" onClick={handleCopy}>
                    {copied ? "Copied!" : "Copy to Clipboard"}
                  </Button>
                </div>
                <pre className="bg-gray-900 rounded p-3 text-xs font-mono text-gray-300 overflow-x-auto">
                  {generatedKeys.join("\n")}
                </pre>
              </div>
            )}
          </div>
        </Collapsible>
      </section>

      {/* Entitlements Section - owner only */}
      {isOwner && (
        <section className="mb-10">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <h2 className="text-xl font-medium">Entitlements</h2>
            <SearchInput
              value={entSearch.searchQuery}
              onChange={entSearch.setSearchQuery}
              placeholder="Search entitlements..."
              label="Search by user ID, source, SKU, or tier"
              className="w-full sm:w-72"
            />
          </div>

          {entLoading ? (
            <TableSkeleton rows={4} columns={6} />
          ) : (
            <>
              {/* Desktop Table */}
              <div className="hidden md:block">
                <Table variant="compact">
                  <Table.Head>
                    <Table.Row>
                      <Table.HeaderCell>User ID</Table.HeaderCell>
                      <Table.HeaderCell>Source</Table.HeaderCell>
                      <Table.HeaderCell>SKU / Plan</Table.HeaderCell>
                      <Table.HeaderCell>Tier</Table.HeaderCell>
                      <Table.HeaderCell>Expiry</Table.HeaderCell>
                      <Table.HeaderCell>Status</Table.HeaderCell>
                    </Table.Row>
                  </Table.Head>
                  <Table.Body>
                    {entitlements?.entitlements.map((ent) => (
                      <Table.Row key={ent.id}>
                        <Table.Cell className="px-4 py-3 font-mono text-xs">
                          {ent.user_id ?? "\u2014"}
                        </Table.Cell>
                        <Table.Cell>
                          <SourceBadge source={ent.source} />
                        </Table.Cell>
                        <Table.Cell>{ent.sku_label}</Table.Cell>
                        <Table.Cell className="px-4 py-3 capitalize">{ent.tier}</Table.Cell>
                        <Table.Cell>
                          {ent.expires_at ? formatDate(ent.expires_at) : "Never"}
                        </Table.Cell>
                        <Table.Cell>
                          <StatusBadge expiresAt={ent.expires_at} />
                        </Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table>
              </div>

              {/* Mobile Cards */}
              <div className="md:hidden space-y-3">
                {entitlements?.entitlements.map((ent) => (
                  <div key={ent.id} className="bg-gray-800 rounded-lg p-4 space-y-2">
                    <div className="flex justify-between items-start">
                      <span className="font-mono text-xs text-gray-400">
                        {ent.user_id ?? "\u2014"}
                      </span>
                      <StatusBadge expiresAt={ent.expires_at} />
                    </div>
                    <div className="flex items-center space-x-2">
                      <SourceBadge source={ent.source} />
                      <span className="text-sm">{ent.sku_label}</span>
                    </div>
                    <div className="text-xs text-gray-400">
                      Tier: <span className="capitalize">{ent.tier}</span> · Expiry:{" "}
                      {ent.expires_at ? formatDate(ent.expires_at) : "Never"}
                    </div>
                  </div>
                ))}
              </div>

              {entitlements && !entSearch.isSearching && (
                <Pagination
                  variant="full"
                  page={entPage}
                  totalPages={entTotalPages}
                  onChange={setEntPage}
                  disabled={entLoading}
                />
              )}

              {entitlements?.entitlements.length === 0 && (
                <p className="text-gray-400 text-center py-8">
                  {entSearch.debouncedSearch
                    ? `No entitlements match "${entSearch.debouncedSearch}".`
                    : "No entitlements found."}
                </p>
              )}
            </>
          )}
        </section>
      )}

      {/* Premium Keys Section */}
      <section>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <h2 className="text-xl font-medium">Premium Keys</h2>
          <SearchInput
            value={keysSearch.searchQuery}
            onChange={keysSearch.setSearchQuery}
            placeholder="Search keys..."
            label="Search by key, SKU, tier, guild, or user"
            className="w-full sm:w-72"
          />
        </div>

        {keysLoading ? (
          <TableSkeleton rows={4} columns={7} />
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block">
              <Table variant="compact">
                <Table.Head>
                  <Table.Row>
                    <Table.HeaderCell>Key</Table.HeaderCell>
                    <Table.HeaderCell>SKU / Plan</Table.HeaderCell>
                    <Table.HeaderCell>Tier</Table.HeaderCell>
                    <Table.HeaderCell>Duration</Table.HeaderCell>
                    <Table.HeaderCell>Generated</Table.HeaderCell>
                    <Table.HeaderCell>Status</Table.HeaderCell>
                    <Table.HeaderCell>Details</Table.HeaderCell>
                  </Table.Row>
                </Table.Head>
                <Table.Body>
                  {keys?.keys.map((key) => (
                    <Table.Row key={key.key}>
                      <Table.Cell className="px-4 py-3 font-mono text-xs">
                        {truncateUuid(key.key)}
                      </Table.Cell>
                      <Table.Cell>{key.sku_label ?? "\u2014"}</Table.Cell>
                      <Table.Cell className="px-4 py-3 capitalize">
                        {key.tier ?? "\u2014"}
                      </Table.Cell>
                      <Table.Cell>{key.length ? formatDuration(key.length) : "\u2014"}</Table.Cell>
                      <Table.Cell>
                        {key.generated_at ? formatDate(key.generated_at) : "\u2014"}
                      </Table.Cell>
                      <Table.Cell>
                        <KeyStatusBadge isUsed={key.is_used} />
                      </Table.Cell>
                      <Table.Cell className="px-4 py-3 text-xs text-gray-400">
                        {key.is_used && (
                          <span>
                            Guild: {key.guild_id ?? "\u2014"} · By: {key.activated_by ?? "\u2014"}
                          </span>
                        )}
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden space-y-3">
              {keys?.keys.map((key) => (
                <div key={key.key} className="bg-gray-800 rounded-lg p-4 space-y-2">
                  <div className="flex justify-between items-start">
                    <span className="font-mono text-xs text-gray-400">{truncateUuid(key.key)}</span>
                    <KeyStatusBadge isUsed={key.is_used} />
                  </div>
                  {!key.is_used ? (
                    <div className="text-sm">
                      <span>{key.sku_label ?? "Unknown"}</span>
                      <span className="text-gray-400 ml-2 capitalize">{key.tier ?? ""}</span>
                      {key.length && (
                        <span className="text-gray-400 ml-2">· {formatDuration(key.length)}</span>
                      )}
                    </div>
                  ) : (
                    <div className="text-xs text-gray-400">
                      Guild: {key.guild_id ?? "\u2014"} · Activated by:{" "}
                      {key.activated_by ?? "\u2014"}
                    </div>
                  )}
                  {key.generated_at && (
                    <div className="text-xs text-gray-400">
                      Generated: {formatDate(key.generated_at)}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {keys && !keysSearch.isSearching && (
              <Pagination
                variant="full"
                page={keysPage}
                totalPages={keysTotalPages}
                onChange={setKeysPage}
                disabled={keysLoading}
              />
            )}

            {keys?.keys.length === 0 && (
              <p className="text-gray-400 text-center py-8">
                {keysSearch.debouncedSearch
                  ? `No premium keys match "${keysSearch.debouncedSearch}".`
                  : "No premium keys found."}
              </p>
            )}
          </>
        )}
      </section>
    </div>
  );
}
