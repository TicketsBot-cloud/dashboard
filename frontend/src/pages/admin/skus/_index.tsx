import { useState, useEffect, useCallback, useMemo } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { apiClient } from "@/lib/api";
import { toast } from "sonner";
import Collapsible from "@/components/Collapsible";
import ConfirmModal from "@/components/modals/ConfirmModal";
import ActionModal from "@/components/modal-primitives/ActionModal";
import Button from "@/components/Button";
import TextInput from "@/components/TextInput";
import NumberInput from "@/components/NumberInput";
import Select from "@/components/Select";
import Slider from "@/components/Slider";
import Table from "@/components/Table";
import SortableHeaderCell from "@/components/SortableHeaderCell";
import SearchInput from "@/components/SearchInput";
import type { SkuWithDetails } from "@/types";
import TableSkeleton from "@/components/skeletons/TableSkeleton";
import { useUrlSearch } from "@/hooks/useUrlSearch";
import { useTableSort } from "@/hooks/useTableSort";
import type { SortColumn } from "@/lib/table-sort";
import { matchesSearch } from "@/lib/search";

type SkuSortKey = "id" | "label" | "sku_type" | "tier" | "priority" | "is_global" | "servers";

const SKU_SORT_COLUMNS: Record<SkuSortKey, SortColumn<SkuWithDetails>> = {
  id: { value: (s) => s.id, defaultDir: "asc" },
  label: { value: (s) => s.label, defaultDir: "asc" },
  sku_type: { value: (s) => s.sku_type, defaultDir: "asc" },
  tier: { value: (s) => s.tier ?? null, defaultDir: "asc" },
  priority: { value: (s) => s.priority ?? null },
  is_global: { value: (s) => s.is_global ?? null },
  servers: { value: (s) => s.servers_permitted ?? null },
};

interface SkuFormState {
  label: string;
  sku_type: string;
  tier: string;
  priority: number;
  is_global: boolean;
  servers_permitted: number | undefined;
}

const emptyForm: SkuFormState = {
  label: "",
  sku_type: "subscription",
  tier: "premium",
  priority: 0,
  is_global: false,
  servers_permitted: undefined,
};

function SkuForm({
  form,
  setForm,
  onSubmit,
  submitLabel,
  submitting,
}: {
  form: SkuFormState;
  setForm: (f: SkuFormState) => void;
  onSubmit: () => void;
  submitLabel: string;
  submitting: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <TextInput
          label="Label"
          value={form.label}
          onChange={(v) => setForm({ ...form, label: v })}
          placeholder="e.g. Premium Monthly"
        />

        <Select
          label="Type"
          value={form.sku_type}
          options={[
            { key: "subscription", label: "Subscription" },
            { key: "consumable", label: "Consumable" },
            { key: "durable", label: "Durable" },
          ]}
          onChange={(v) => setForm({ ...form, sku_type: v ?? "subscription" })}
          hideSearch
        />

        {form.sku_type === "subscription" && (
          <>
            <Select
              label="Tier"
              value={form.tier}
              options={[
                { key: "premium", label: "Premium" },
                { key: "whitelabel", label: "Whitelabel" },
              ]}
              onChange={(v) => setForm({ ...form, tier: v ?? "premium" })}
              hideSearch
            />

            <NumberInput
              label="Priority"
              value={form.priority}
              min={0}
              onChange={(v) => setForm({ ...form, priority: v })}
            />

            <Slider
              label="Global"
              value={form.is_global}
              onChange={(v) => setForm({ ...form, is_global: v })}
            />
          </>
        )}

        <NumberInput
          label="Servers Permitted (optional)"
          value={form.servers_permitted ?? 0}
          min={0}
          onChange={(v) =>
            setForm({
              ...form,
              servers_permitted: v === 0 ? undefined : v,
            })
          }
        />
      </div>

      <Button variant="primary" onClick={onSubmit} disabled={submitting || !form.label}>
        {submitting ? "Saving..." : submitLabel}
      </Button>
    </div>
  );
}

function truncateUuid(uuid: string): string {
  return uuid.length > 13 ? uuid.slice(0, 13) + "..." : uuid;
}

export default function AdminSkusPage() {
  const [skus, setSkus] = useState<SkuWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const { searchQuery, setSearchQuery, debouncedSearch } = useUrlSearch();

  // Add SKU form
  const [addForm, setAddForm] = useState<SkuFormState>(emptyForm);
  const [adding, setAdding] = useState(false);

  // Edit modal
  const [editSku, setEditSku] = useState<SkuWithDetails | null>(null);
  const [editForm, setEditForm] = useState<SkuFormState>(emptyForm);
  const [saving, setSaving] = useState(false);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<SkuWithDetails | null>(null);

  const fetchSkus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.admin.skus.list();
      setSkus(res.data);
    } catch {
      // Error handled by interceptor
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSkus();
  }, [fetchSkus]);

  function formToPayload(form: SkuFormState) {
    return {
      label: form.label,
      sku_type: form.sku_type,
      tier: form.sku_type === "subscription" ? form.tier : undefined,
      priority: form.sku_type === "subscription" ? form.priority : undefined,
      is_global: form.sku_type === "subscription" ? form.is_global : undefined,
      servers_permitted: form.servers_permitted,
    };
  }

  function skuToForm(sku: SkuWithDetails): SkuFormState {
    return {
      label: sku.label,
      sku_type: sku.sku_type,
      tier: sku.tier ?? "premium",
      priority: sku.priority ?? 0,
      is_global: sku.is_global ?? false,
      servers_permitted: sku.servers_permitted,
    };
  }

  const handleAdd = async () => {
    setAdding(true);
    try {
      await apiClient.admin.skus.create(formToPayload(addForm));
      toast.success("SKU created successfully.");
      setAddForm(emptyForm);
      await fetchSkus();
    } catch {
      // Error handled by interceptor
    } finally {
      setAdding(false);
    }
  };

  const handleEdit = async () => {
    if (!editSku) return;
    setSaving(true);
    try {
      await apiClient.admin.skus.update(editSku.id, formToPayload(editForm));
      toast.success("SKU updated successfully.");
      setEditSku(null);
      await fetchSkus();
    } catch {
      // Error handled by interceptor
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await apiClient.admin.skus.delete(deleteTarget.id);
      toast.success("SKU deleted.");
      setDeleteTarget(null);
      await fetchSkus();
    } catch {
      // Error handled by interceptor
    }
  };

  const openEdit = (sku: SkuWithDetails) => {
    setEditSku(sku);
    setEditForm(skuToForm(sku));
  };

  const filteredSkus = useMemo(() => {
    return skus.filter((sku) =>
      matchesSearch(debouncedSearch, sku.id, sku.label, sku.sku_type, sku.tier),
    );
  }, [skus, debouncedSearch]);

  const sort = useTableSort(filteredSkus, SKU_SORT_COLUMNS, {
    initialSort: { key: "label", dir: "asc" },
    persistKey: "admin-skus",
  });

  return (
    <div>
      <header className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-semibold mb-2 text-center">SKUs</h1>
        <p className="text-center text-gray-400 text-sm sm:text-base">
          Manage SKU definitions and their subscription/multi-server details
        </p>
      </header>

      {/* Add SKU Section */}
      <section className="mb-10">
        <Collapsible title="Add SKU" subtitle="Create a new SKU definition">
          <SkuForm
            form={addForm}
            setForm={setAddForm}
            onSubmit={handleAdd}
            submitLabel="Create SKU"
            submitting={adding}
          />
        </Collapsible>
      </section>

      {/* SKU List */}
      <section>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <h2 className="text-xl font-medium">SKUs</h2>
          <SearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search SKUs..."
            label="Search by ID, label, type, or tier"
            className="w-full sm:w-72"
          />
        </div>

        {loading ? (
          <TableSkeleton rows={4} columns={8} />
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block">
              <Table variant="compact">
                <Table.Head>
                  <Table.Row>
                    <SortableHeaderCell sort={sort} sortKey="id" label="ID" />
                    <SortableHeaderCell sort={sort} sortKey="label" label="Label" />
                    <SortableHeaderCell sort={sort} sortKey="sku_type" label="Type" />
                    <SortableHeaderCell sort={sort} sortKey="tier" label="Tier" />
                    <SortableHeaderCell sort={sort} sortKey="priority" label="Priority" />
                    <SortableHeaderCell sort={sort} sortKey="is_global" label="Global" />
                    <SortableHeaderCell sort={sort} sortKey="servers" label="Servers" />
                    <Table.HeaderCell>Actions</Table.HeaderCell>
                  </Table.Row>
                </Table.Head>
                <Table.Body>
                  {sort.sortedRows.map((sku) => (
                    <Table.Row key={sku.id}>
                      <Table.Cell className="px-4 py-3 font-mono text-xs">
                        {truncateUuid(sku.id)}
                      </Table.Cell>
                      <Table.Cell className="px-4 py-3 text-white">{sku.label}</Table.Cell>
                      <Table.Cell className="px-4 py-3 capitalize">{sku.sku_type}</Table.Cell>
                      <Table.Cell className="px-4 py-3 capitalize">{sku.tier ?? "-"}</Table.Cell>
                      <Table.Cell>{sku.priority ?? "-"}</Table.Cell>
                      <Table.Cell>
                        {sku.is_global != null ? (
                          sku.is_global ? (
                            <span className="text-blue-400">Yes</span>
                          ) : (
                            <span className="text-gray-500">No</span>
                          )
                        ) : (
                          "-"
                        )}
                      </Table.Cell>
                      <Table.Cell>{sku.servers_permitted ?? "-"}</Table.Cell>
                      <Table.Cell>
                        <div className="flex gap-2">
                          <Button variant="primary" size="sm" onClick={() => openEdit(sku)}>
                            <FontAwesomeIcon icon="edit" className="mr-1" />
                            Edit
                          </Button>
                          <Button variant="danger" size="sm" onClick={() => setDeleteTarget(sku)}>
                            <FontAwesomeIcon icon="trash" className="mr-1" />
                            Delete
                          </Button>
                        </div>
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden space-y-3">
              {filteredSkus.map((sku) => (
                <div key={sku.id} className="bg-gray-800 rounded-lg p-4 space-y-2">
                  <div className="flex justify-between items-start">
                    <span className="text-white font-medium">{sku.label}</span>
                    <span className="capitalize text-gray-400 text-sm">{sku.sku_type}</span>
                  </div>
                  <div className="text-sm text-gray-400">
                    {sku.tier && <span className="capitalize">{sku.tier}</span>}
                    {sku.priority != null && <span> &middot; Priority {sku.priority}</span>}
                    {sku.is_global && <span className="ml-2 text-blue-400 text-xs">(Global)</span>}
                  </div>
                  {sku.servers_permitted != null && (
                    <div className="text-xs text-gray-500">
                      {sku.servers_permitted} server{sku.servers_permitted !== 1 ? "s" : ""}{" "}
                      permitted
                    </div>
                  )}
                  <div className="font-mono text-xs text-gray-500">{truncateUuid(sku.id)}</div>
                  <div className="flex gap-2 pt-1">
                    <Button variant="primary" size="sm" onClick={() => openEdit(sku)}>
                      Edit
                    </Button>
                    <Button variant="danger" size="sm" onClick={() => setDeleteTarget(sku)}>
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            {filteredSkus.length === 0 && (
              <p className="text-gray-400 text-center py-8">
                {debouncedSearch ? `No SKUs match "${debouncedSearch}".` : "No SKUs found."}
              </p>
            )}
          </>
        )}
      </section>

      {/* Edit Modal */}
      <ActionModal isOpen={!!editSku} onClose={() => setEditSku(null)} className="max-w-2xl">
        <div className="p-6">
          <h3 className="text-xl font-semibold mb-4">Edit SKU</h3>
          <SkuForm
            form={editForm}
            setForm={setEditForm}
            onSubmit={handleEdit}
            submitLabel="Save Changes"
            submitting={saving}
          />
        </div>
      </ActionModal>

      {/* Delete Confirmation */}
      <ConfirmModal
        isOpen={!!deleteTarget}
        title="Delete SKU"
        message={`Are you sure you want to delete "${deleteTarget?.label}"? This action cannot be undone.`}
        confirmText="Delete"
        confirmVariant="danger"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
