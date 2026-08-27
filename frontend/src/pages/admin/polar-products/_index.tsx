import { useState, useEffect, useCallback, useMemo, useRef } from "react";
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
import Textarea from "@/components/Textarea";
import Table from "@/components/Table";
import SortableHeaderCell from "@/components/SortableHeaderCell";
import SearchInput from "@/components/SearchInput";
import type { PolarProduct, SubscriptionSku } from "@/types";
import { formatCurrency } from "@/lib/currency";
import TableSkeleton from "@/components/skeletons/TableSkeleton";
import { useUrlSearch } from "@/hooks/useUrlSearch";
import { useTableSort } from "@/hooks/useTableSort";
import type { SortColumn } from "@/lib/table-sort";
import { matchesSearch } from "@/lib/search";

type ProductSortKey = "name" | "tier" | "interval" | "price" | "polar_id" | "highlighted";

const PRODUCT_SORT_COLUMNS: Record<ProductSortKey, SortColumn<PolarProduct>> = {
  name: { value: (p) => p.name, defaultDir: "asc" },
  tier: { value: (p) => p.tier, defaultDir: "asc" },
  interval: { value: (p) => p.interval, defaultDir: "asc" },
  price: { value: (p) => p.price },
  polar_id: { value: (p) => p.polar_product_id, defaultDir: "asc" },
  highlighted: { value: (p) => p.highlighted },
};

interface ProductFormState {
  name: string;
  description: string;
  polar_product_id: string;
  sku_id: string;
  interval: string;
  price: number;
  currency: string;
  features: string;
  highlighted: boolean;
  sort_order: number;
  tier: string;
  servers_permitted: number | undefined;
}

const CURRENCY_OPTIONS = [
  { key: "usd", label: "USD" },
  { key: "gbp", label: "GBP" },
  { key: "eur", label: "EUR" },
  { key: "aud", label: "AUD" },
  { key: "brl", label: "BRL" },
  { key: "cad", label: "CAD" },
  { key: "chf", label: "CHF" },
  { key: "inr", label: "INR" },
  { key: "jpy", label: "JPY" },
  { key: "sek", label: "SEK" },
];

const emptyForm: ProductFormState = {
  name: "",
  description: "",
  polar_product_id: "",
  sku_id: "",
  interval: "month",
  price: 0,
  currency: "usd",
  features: "",
  highlighted: false,
  sort_order: 0,
  tier: "premium",
  servers_permitted: undefined,
};

function ProductForm({
  form,
  setForm,
  skus,
  skusLoading,
  onSubmit,
  submitLabel,
  submitting,
}: {
  form: ProductFormState;
  setForm: React.Dispatch<React.SetStateAction<ProductFormState>>;
  skus: SubscriptionSku[];
  skusLoading: boolean;
  onSubmit: () => void;
  submitLabel: string;
  submitting: boolean;
}) {
  const [lookupLoading, setLookupLoading] = useState(false);
  const lookupRef = useRef(0);

  const lookupPolarProduct = useCallback(
    async (polarProductId: string) => {
      const trimmed = polarProductId.trim();
      if (trimmed.length < 8) return;

      const token = ++lookupRef.current;
      setLookupLoading(true);
      try {
        const res = await apiClient.admin.polarProducts.lookup(trimmed);
        if (token !== lookupRef.current) return;
        const data = res.data;
        setForm((prev) => ({
          ...prev,
          name: prev.name || data.name,
          price: data.price,
          currency: data.currency,
          interval: data.interval || prev.interval,
        }));
      } catch {
        // Product not found on Polar, leave form as-is
      } finally {
        if (token === lookupRef.current) setLookupLoading(false);
      }
    },
    [setForm],
  );

  useEffect(() => {
    const id = form.polar_product_id.trim();
    if (id.length < 8) return;
    const timer = setTimeout(() => lookupPolarProduct(id), 500);
    return () => clearTimeout(timer);
  }, [form.polar_product_id, lookupPolarProduct]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <TextInput
          label="Name"
          value={form.name}
          onChange={(v) => setForm({ ...form, name: v })}
          placeholder="e.g. Premium"
        />

        <TextInput
          label="Description"
          value={form.description}
          onChange={(v) => setForm({ ...form, description: v })}
          placeholder="e.g. 1 server"
        />

        <TextInput
          label={lookupLoading ? "Polar Product ID (fetching...)" : "Polar Product ID"}
          value={form.polar_product_id}
          onChange={(v) => setForm((prev) => ({ ...prev, polar_product_id: v }))}
          placeholder="UUID from Polar.sh"
        />

        <Select
          label="SKU"
          value={form.sku_id || null}
          options={skus.map((sku) => ({ key: sku.id, label: `${sku.label} (${sku.tier})` }))}
          onChange={(v) => setForm({ ...form, sku_id: v ?? "" })}
          disabled={skusLoading}
          placeholder="Select a SKU..."
        />

        <Select
          label="Interval"
          value={form.interval}
          options={[
            { key: "month", label: "Month" },
            { key: "year", label: "Year" },
          ]}
          onChange={(v) => setForm({ ...form, interval: v ?? "month" })}
          hideSearch
        />

        <NumberInput
          label="Price (minor units)"
          value={form.price}
          min={0}
          onChange={(v) => setForm({ ...form, price: v })}
        />

        <Select
          label="Currency"
          value={form.currency}
          options={CURRENCY_OPTIONS}
          onChange={(v) => setForm({ ...form, currency: v ?? "usd" })}
          hideSearch
        />

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
          label="Sort Order"
          value={form.sort_order}
          min={0}
          onChange={(v) => setForm({ ...form, sort_order: v })}
        />

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

        <Slider
          label="Highlighted"
          value={form.highlighted}
          onChange={(v) => setForm({ ...form, highlighted: v })}
        />
      </div>

      <Textarea
        label="Features (one per line)"
        value={form.features}
        onChange={(v) => setForm({ ...form, features: v })}
        placeholder={"Unlimited panels\nBranding removal\nStatistics"}
        max={2000}
      />

      <Button
        variant="primary"
        onClick={onSubmit}
        disabled={submitting || !form.name || !form.sku_id || !form.polar_product_id}
      >
        {submitting ? "Saving..." : submitLabel}
      </Button>
    </div>
  );
}

function truncateUuid(uuid: string): string {
  return uuid.length > 13 ? uuid.slice(0, 13) + "..." : uuid;
}

function formatPrice(amount: number, currency: string): string {
  return formatCurrency(amount, currency);
}

export default function AdminPolarProductsPage() {
  const [products, setProducts] = useState<PolarProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const { searchQuery, setSearchQuery, debouncedSearch } = useUrlSearch();
  const [skus, setSkus] = useState<SubscriptionSku[]>([]);
  const [skusLoading, setSkusLoading] = useState(false);

  // Add product form
  const [addForm, setAddForm] = useState<ProductFormState>(emptyForm);
  const [adding, setAdding] = useState(false);

  // Edit modal
  const [editProduct, setEditProduct] = useState<PolarProduct | null>(null);
  const [editForm, setEditForm] = useState<ProductFormState>(emptyForm);
  const [saving, setSaving] = useState(false);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<PolarProduct | null>(null);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.admin.polarProducts.list();
      setProducts(res.data);
    } catch {
      // Error handled by interceptor
    } finally {
      setLoading(false);
    }
  }, []);

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
    fetchProducts();
    fetchSkus();
  }, [fetchProducts, fetchSkus]);

  /** Convert form state into API payload. */
  function formToPayload(form: ProductFormState) {
    return {
      name: form.name,
      description: form.description,
      polar_product_id: form.polar_product_id,
      sku_id: form.sku_id,
      interval: form.interval,
      price: form.price,
      currency: form.currency,
      features: form.features
        .split("\n")
        .map((f) => f.trim())
        .filter(Boolean),
      highlighted: form.highlighted,
      sort_order: form.sort_order,
      tier: form.tier,
      servers_permitted: form.servers_permitted,
    };
  }

  /** Convert a PolarProduct into form state for editing. */
  function productToForm(product: PolarProduct): ProductFormState {
    return {
      name: product.name,
      description: product.description,
      polar_product_id: product.polar_product_id,
      sku_id: product.sku_id,
      interval: product.interval,
      price: product.price,
      currency: product.currency,
      features: product.features.join("\n"),
      highlighted: product.highlighted,
      sort_order: product.sort_order,
      tier: product.tier,
      servers_permitted: product.servers_permitted,
    };
  }

  const handleAdd = async () => {
    setAdding(true);
    try {
      await apiClient.admin.polarProducts.create(formToPayload(addForm));
      toast.success("Product created successfully.");
      setAddForm(emptyForm);
      await fetchProducts();
    } catch {
      // Error handled by interceptor
    } finally {
      setAdding(false);
    }
  };

  const handleEdit = async () => {
    if (!editProduct) return;
    setSaving(true);
    try {
      await apiClient.admin.polarProducts.update(editProduct.id, formToPayload(editForm));
      toast.success("Product updated successfully.");
      setEditProduct(null);
      await fetchProducts();
    } catch {
      // Error handled by interceptor
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await apiClient.admin.polarProducts.delete(deleteTarget.id);
      toast.success("Product deleted.");
      setDeleteTarget(null);
      await fetchProducts();
    } catch {
      // Error handled by interceptor
    }
  };

  const openEdit = (product: PolarProduct) => {
    setEditProduct(product);
    setEditForm(productToForm(product));
  };

  const filteredProducts = useMemo(() => {
    return products.filter((product) =>
      matchesSearch(
        debouncedSearch,
        product.id,
        product.name,
        product.description,
        product.polar_product_id,
        product.tier,
        product.interval,
        product.sku_id,
      ),
    );
  }, [products, debouncedSearch]);

  // "Sort" is a domain column (sort_order), so the default order is that, not a header sort.
  const sort = useTableSort(filteredProducts, PRODUCT_SORT_COLUMNS, {
    initialSort: { key: "name", dir: "asc" },
    persistKey: "admin-polar-products",
  });

  return (
    <div>
      <header className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-semibold mb-2 text-center">Polar Products</h1>
        <p className="text-center text-gray-400 text-sm sm:text-base">
          Manage Polar product listings for the premium pricing page
        </p>
      </header>

      {/* Add Product Section */}
      <section className="mb-10">
        <Collapsible title="Add Product" subtitle="Create a new Polar product listing">
          <ProductForm
            form={addForm}
            setForm={setAddForm}
            skus={skus}
            skusLoading={skusLoading}
            onSubmit={handleAdd}
            submitLabel="Create Product"
            submitting={adding}
          />
        </Collapsible>
      </section>

      {/* Product List */}
      <section>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <h2 className="text-xl font-medium">Products</h2>
          <SearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search products..."
            label="Search by name, tier, interval, or Polar product ID"
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
                    <SortableHeaderCell sort={sort} sortKey="name" label="Name" />
                    <SortableHeaderCell sort={sort} sortKey="tier" label="Tier" />
                    <SortableHeaderCell sort={sort} sortKey="interval" label="Interval" />
                    <SortableHeaderCell sort={sort} sortKey="price" label="Price" />
                    <SortableHeaderCell sort={sort} sortKey="polar_id" label="Polar Product ID" />
                    <SortableHeaderCell sort={sort} sortKey="highlighted" label="Highlighted" />
                    <Table.HeaderCell>Sort</Table.HeaderCell>
                    <Table.HeaderCell>Actions</Table.HeaderCell>
                  </Table.Row>
                </Table.Head>
                <Table.Body>
                  {sort.sortedRows.map((product) => (
                    <Table.Row key={product.id}>
                      <Table.Cell className="px-4 py-3 text-white">{product.name}</Table.Cell>
                      <Table.Cell className="px-4 py-3 capitalize">{product.tier}</Table.Cell>
                      <Table.Cell className="px-4 py-3 capitalize">{product.interval}</Table.Cell>
                      <Table.Cell>{formatPrice(product.price, product.currency)}</Table.Cell>
                      <Table.Cell className="px-4 py-3 font-mono text-xs">
                        {truncateUuid(product.polar_product_id)}
                      </Table.Cell>
                      <Table.Cell>
                        {product.highlighted ? (
                          <span className="text-blue-400">Yes</span>
                        ) : (
                          <span className="text-gray-500">No</span>
                        )}
                      </Table.Cell>
                      <Table.Cell>{product.sort_order}</Table.Cell>
                      <Table.Cell>
                        <div className="flex gap-2">
                          <Button variant="primary" size="sm" onClick={() => openEdit(product)}>
                            <FontAwesomeIcon icon="edit" className="mr-1" />
                            Edit
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => setDeleteTarget(product)}
                          >
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
              {filteredProducts.map((product) => (
                <div key={product.id} className="bg-gray-800 rounded-lg p-4 space-y-2">
                  <div className="flex justify-between items-start">
                    <span className="text-white font-medium">{product.name}</span>
                    <span className="capitalize text-gray-400 text-sm">{product.tier}</span>
                  </div>
                  <div className="text-sm text-gray-400">
                    {product.interval === "month" ? "Monthly" : "Annual"} &middot;{" "}
                    {formatPrice(product.price, product.currency)}
                    {product.highlighted && (
                      <span className="ml-2 text-blue-400 text-xs">(Highlighted)</span>
                    )}
                  </div>
                  <div className="font-mono text-xs text-gray-500">
                    {truncateUuid(product.polar_product_id)}
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button variant="primary" size="sm" onClick={() => openEdit(product)}>
                      Edit
                    </Button>
                    <Button variant="danger" size="sm" onClick={() => setDeleteTarget(product)}>
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            {filteredProducts.length === 0 && (
              <p className="text-gray-400 text-center py-8">
                {debouncedSearch ? `No products match "${debouncedSearch}".` : "No products found."}
              </p>
            )}
          </>
        )}
      </section>

      {/* Edit Modal */}
      <ActionModal
        isOpen={!!editProduct}
        onClose={() => setEditProduct(null)}
        className="max-w-2xl"
      >
        <div className="p-6">
          <h3 className="text-xl font-semibold mb-4">Edit Product</h3>
          <ProductForm
            form={editForm}
            setForm={setEditForm}
            skus={skus}
            skusLoading={skusLoading}
            onSubmit={handleEdit}
            submitLabel="Save Changes"
            submitting={saving}
          />
        </div>
      </ActionModal>

      {/* Delete Confirmation */}
      <ConfirmModal
        isOpen={!!deleteTarget}
        title="Delete Product"
        message={`Are you sure you want to delete "${deleteTarget?.name}"? This action cannot be undone.`}
        confirmText="Delete"
        confirmVariant="danger"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
