import { useEffect, useRef, useState, type FC } from "react";
import { useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { apiClient, SKIP_ERROR_TOAST } from "@/lib/api";
import { getGuildById } from "@/stores/auth";
import { useGuildStore } from "@/stores/guild";
import { MainLayout } from "@/pages/layout/Main";
import Button from "@/components/Button";
import TextInput from "@/components/TextInput";
import Textarea from "@/components/Textarea";
import Select from "@/components/Select";
import ConfirmModal from "@/components/modals/ConfirmModal";
import FeatureLockBanner from "@/components/FeatureLockBanner";
import { useFeatureLock } from "@/hooks/useFeatureLock";
import { FEATURE_INTEGRATIONS } from "@/lib/feature-flags";
import type {
  Integration,
  IntegrationPlaceholder,
  IntegrationSecret,
  IntegrationHeader,
} from "@/types";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus, faTrash } from "@fortawesome/free-solid-svg-icons";
import { useApiErrorHandler } from "@/hooks/useApiErrorHandler";

function buildExampleJson(placeholders: IntegrationPlaceholder[]): string {
  try {
    const obj: Record<string, unknown> = {};
    for (const p of placeholders) {
      if (!p.json_path) continue;
      const parts = p.json_path.split(".");
      let cur: Record<string, unknown> = obj;
      for (let i = 0; i < parts.length; i++) {
        if (i === parts.length - 1) {
          cur[parts[i]] = "...";
        } else {
          if (!cur[parts[i]]) cur[parts[i]] = {};
          cur = cur[parts[i]] as Record<string, unknown>;
        }
      }
    }
    return JSON.stringify(obj, null, 2);
  } catch {
    return "{}";
  }
}

const ManageIntegrationPage: FC = () => {
  let { guildId, integration: integrationId } = useParams();
  guildId = guildId!;
  integrationId = integrationId!;

  const { selectGuild, selectedGuild } = useGuildStore();
  const navigate = useNavigate();

  const [data, setData] = useState<Integration | null>(null);
  const [deleteModal, setDeleteModal] = useState(false);
  const [publicModal, setPublicModal] = useState(false);
  const { locked: polledLock } = useFeatureLock(FEATURE_INTEGRATIONS, guildId);
  const [forcedLock, setForcedLock] = useState(false);
  const isLocked = forcedLock || polledLock === true;

  // This page is a long-lived editor rather than a form the user navigates away
  // from after one submit (Save and Make Public both leave the user here; only
  // Delete navigates away), so a forced lock from a 503 must release once the
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
      toast.success("Integration changes are available again.");
    }
    previousLockRef.current = isLocked;
  }, [isLocked]);

  useEffect(() => {
    const guild = getGuildById(guildId);
    if (guild && (!selectedGuild || selectedGuild.id !== guild.id)) {
      selectGuild(guild);
    }
  }, [guildId, selectGuild, selectedGuild]);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await apiClient.integrations.viewDetail(integrationId);
        setData({
          ...res.data,
          description: res.data.description ?? "",
          placeholders: res.data.placeholders ?? [],
          secrets: (res.data.secrets ?? []).map((s) => ({
            ...s,
            description: s.description ?? "",
          })),
          headers: res.data.headers ?? [],
        });
      } catch {
        // error handled by interceptor
      }
    };
    load();
  }, [integrationId]);

  const updateField = <K extends keyof Integration>(key: K, value: Integration[K]) =>
    setData((prev) => (prev ? { ...prev, [key]: value } : prev));

  const addPlaceholder = () =>
    setData((prev) =>
      prev
        ? { ...prev, placeholders: [...(prev.placeholders ?? []), { name: "", json_path: "" }] }
        : prev,
    );

  const updatePlaceholder = (i: number, field: keyof IntegrationPlaceholder, val: string) =>
    setData((prev) => {
      if (!prev) return prev;
      const placeholders = [...(prev.placeholders ?? [])];
      placeholders[i] = {
        ...placeholders[i],
        [field]: field === "name" ? val.replace(/[ %]/g, "") : val,
      };
      return { ...prev, placeholders };
    });

  const removePlaceholder = (i: number) =>
    setData((prev) =>
      prev
        ? { ...prev, placeholders: (prev.placeholders ?? []).filter((_, idx) => idx !== i) }
        : prev,
    );

  const addSecret = () =>
    setData((prev) =>
      prev ? { ...prev, secrets: [...(prev.secrets ?? []), { name: "", description: "" }] } : prev,
    );

  const updateSecret = (i: number, field: keyof IntegrationSecret, val: string) =>
    setData((prev) => {
      if (!prev) return prev;
      const secrets = [...(prev.secrets ?? [])];
      secrets[i] = {
        ...secrets[i],
        [field]: field === "name" ? val.replace(/[ %]/g, "") : val,
      };
      return { ...prev, secrets };
    });

  const removeSecret = (i: number) =>
    setData((prev) =>
      prev ? { ...prev, secrets: (prev.secrets ?? []).filter((_, idx) => idx !== i) } : prev,
    );

  const addHeader = () =>
    setData((prev) =>
      prev ? { ...prev, headers: [...(prev.headers ?? []), { name: "", value: "" }] } : prev,
    );

  const updateHeader = (i: number, field: keyof IntegrationHeader, val: string) =>
    setData((prev) => {
      if (!prev) return prev;
      const headers = [...(prev.headers ?? [])];
      headers[i] = {
        ...headers[i],
        [field]: field === "name" ? val.replace(/ /g, "-") : val,
      };
      return { ...prev, headers };
    });

  const removeHeader = (i: number) =>
    setData((prev) =>
      prev ? { ...prev, headers: (prev.headers ?? []).filter((_, idx) => idx !== i) } : prev,
    );

  const handleApiError = useApiErrorHandler(
    "Integration management is temporarily unavailable. Please try again shortly.",
    setForcedLock,
  );

  const handleSave = async () => {
    if (!data) return;
    const payload = {
      ...data,
      image_url: data.image_url || null,
      privacy_policy_url: data.privacy_policy_url || null,
      validation_url: data.validation_url || null,
    };
    try {
      await apiClient.integrations.update(integrationId, payload, SKIP_ERROR_TOAST);
      toast.success("Integration updated");
    } catch (error) {
      handleApiError(error, "Failed to update integration. Please try again.");
      console.error("Failed to update integration:", error);
    }
  };

  const handleDelete = async () => {
    try {
      await apiClient.integrations.delete(integrationId, SKIP_ERROR_TOAST);
      navigate(`/manage/${guildId}/integrations`);
    } catch (error) {
      handleApiError(error, "Failed to delete integration. Please try again.");
      console.error("Failed to delete integration:", error);
    }
    setDeleteModal(false);
  };

  const handleMakePublic = async () => {
    if (!data) return;
    try {
      await apiClient.integrations.makePublic(integrationId, data, SKIP_ERROR_TOAST);
      toast.success(
        "Your request to make this integration public has been submitted! It will be reviewed over the next few days.",
      );
      setData((prev) => (prev ? { ...prev, public: true } : prev));
    } catch (error) {
      handleApiError(error, "Failed to submit integration for public review. Please try again.");
      console.error("Failed to make integration public:", error);
    }
    setPublicModal(false);
  };

  if (!data) {
    return (
      <MainLayout title="Manage Integration">
        <FeatureLockBanner
          id="integration-lock-banner"
          locked={isLocked}
          featureLabel="Integration changes"
          existingLabel="integrations"
        />
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
        </div>
      </MainLayout>
    );
  }

  const exampleJson = buildExampleJson(data.placeholders ?? []);
  const firstSecret = data.secrets?.[0];

  return (
    <MainLayout
      title={`Manage ${data.name}`}
      subtitle="Edit your integration's metadata and HTTP configuration"
    >
      <FeatureLockBanner
        id="integration-lock-banner"
        locked={isLocked}
        featureLabel="Integration changes"
        existingLabel="integrations"
      />
      <div className="flex flex-col gap-6">
        {/* Metadata */}
        <div className="bg-gray-800 rounded-xl overflow-hidden">
          <div className="p-4">
            <h2 className="text-xl font-medium">Integration Metadata</h2>
          </div>
          <hr className="border-gray-700" />
          <div className="p-4 flex flex-col gap-4">
            <p className="text-gray-400 text-sm">Let people know what your integration does.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <TextInput
                label="Name"
                placeholder="My Integration"
                value={data.name.slice(0, 32)}
                onChange={(v) => updateField("name", v.slice(0, 32))}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <TextInput
                label="Image URL"
                placeholder="https://example.com/logo.png"
                value={data.image_url ?? ""}
                onChange={(v) => updateField("image_url", v || null)}
              />
              <TextInput
                label="Privacy Policy URL"
                placeholder="https://example.com/privacy"
                value={data.privacy_policy_url ?? ""}
                onChange={(v) => updateField("privacy_policy_url", v || null)}
              />
            </div>
            <Textarea
              label="Description"
              placeholder="Let people know what your integration does"
              value={(data.description ?? "").slice(0, 255)}
              onChange={(v) => updateField("description", v.slice(0, 255))}
              max={255}
            />
          </div>
          <div className="p-4 flex gap-3 justify-end border-t border-gray-700">
            <Button
              type="button"
              variant="primary"
              disabled={data.public}
              // Native `disabled` already wins when the integration is already
              // public; only fall back to the visually-disabled/aria-disabled
              // treatment when the lock is the sole reason the button can't be
              // pressed, mirroring TagEditorModal's Save button.
              visuallyDisabled={isLocked && !data.public}
              aria-describedby={isLocked ? "integration-lock-banner" : undefined}
              onClick={() => setPublicModal(true)}
            >
              Make Public
            </Button>
            <Button
              type="button"
              variant="danger"
              visuallyDisabled={isLocked}
              aria-describedby={isLocked ? "integration-lock-banner" : undefined}
              onClick={() => setDeleteModal(true)}
            >
              Delete Integration
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* HTTP Request */}
          <div className="bg-gray-800 rounded-xl overflow-hidden">
            <div className="p-4">
              <h2 className="text-xl font-medium">HTTP Request</h2>
            </div>
            <hr className="border-gray-700" />
            <div className="p-4 flex flex-col gap-6">
              {/* API Endpoint */}
              <div className="flex flex-col gap-2">
                <h3 className="text-white font-medium">API Endpoint</h3>
                <p className="text-gray-400 text-sm">
                  When a user opens a ticket, a HTTP{" "}
                  <code className="bg-gray-700 px-1 rounded">{data.http_method}</code> request will
                  be sent to the provided URL. The URL must respond with a valid JSON payload.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <Select
                    label="Method"
                    value={data.http_method}
                    onChange={(v) => updateField("http_method", v ?? "")}
                    options={[
                      { key: "GET", label: "GET" },
                      { key: "POST", label: "POST" },
                    ]}
                    hideSearch
                  />
                  <div className="sm:col-span-3">
                    <TextInput
                      label="Request URL"
                      placeholder="https://api.example.com/users/find?discord=%user_id%"
                      value={data.webhook_url}
                      onChange={(v) => updateField("webhook_url", v)}
                    />
                  </div>
                </div>
              </div>

              <hr className="border-gray-700" />

              {/* Secrets */}
              <div className="flex flex-col gap-2">
                <h3 className="text-white font-medium">Secrets</h3>
                <p className="text-gray-400 text-sm">
                  If creating a public integration, you may wish to let users provide secret values
                  (e.g. API keys). Do not include{" "}
                  <code className="bg-gray-700 px-1 rounded">%</code> symbols in secret names.
                </p>
                <div className="flex flex-col gap-3">
                  {(data.secrets ?? []).map((secret, i) => (
                    <div key={i} className="flex flex-col gap-2">
                      {i > 0 && <hr className="border-gray-700" />}
                      <div className="flex gap-2 items-end">
                        <div className="flex-1">
                          <TextInput
                            label={i === 0 ? "Secret Name" : undefined}
                            placeholder="api_key"
                            value={secret.name}
                            onChange={(v) => updateSecret(i, "name", v)}
                          />
                        </div>
                        <Button
                          variant="danger"
                          size="icon"
                          title="Remove Secret"
                          onClick={() => removeSecret(i)}
                          className="mb-0.5"
                        >
                          <FontAwesomeIcon icon={faTrash} />
                        </Button>
                      </div>
                      <Textarea
                        label="Description"
                        placeholder="Tell users what value to enter for this secret"
                        value={secret.description ?? ""}
                        onChange={(v) => updateSecret(i, "description", v)}
                        max={255}
                      />
                    </div>
                  ))}
                </div>
                <Button
                  variant="secondary"
                  title="Add Secret"
                  onClick={addSecret}
                  disabled={(data.secrets?.length ?? 0) >= 5}
                  className="w-full"
                >
                  <FontAwesomeIcon icon={faPlus} className="mr-1" /> Add Secret
                </Button>
              </div>

              <hr className="border-gray-700" />

              {/* Secret Validation */}
              <div className="flex flex-col gap-2">
                <h3 className="text-white font-medium">Secret Validation (Optional)</h3>
                <p className="text-gray-400 text-sm">
                  Specify a URL to validate secrets when a user adds your integration. Respond with
                  2XX if valid, any other status to reject.
                </p>
                <TextInput
                  label="Validation URL"
                  placeholder="https://api.example.com/validate"
                  value={data.validation_url ?? ""}
                  onChange={(v) => updateField("validation_url", v || null)}
                />
              </div>

              <hr className="border-gray-700" />

              {/* Headers */}
              <div className="flex flex-col gap-2">
                <h3 className="text-white font-medium">Request Headers</h3>
                <p className="text-gray-400 text-sm">
                  Up to 5 HTTP headers sent with the request. You may use{" "}
                  <code className="bg-gray-700 px-1 rounded">%user_id%</code> or secret placeholders
                  like{" "}
                  {firstSecret ? (
                    <code className="bg-gray-700 px-1 rounded">%{firstSecret.name}%</code>
                  ) : (
                    <code className="bg-gray-700 px-1 rounded">%secret_name%</code>
                  )}
                  .
                </p>
                <div className="flex flex-col gap-3">
                  {(data.headers ?? []).map((header, i) => (
                    <div key={i} className="flex gap-2 items-end">
                      <div className="flex-1">
                        <TextInput
                          label={i === 0 ? "Header Name" : undefined}
                          placeholder="x-auth-key"
                          value={header.name}
                          onChange={(v) => updateHeader(i, "name", v)}
                        />
                      </div>
                      <div className="flex-1">
                        <TextInput
                          label={i === 0 ? "Header Value" : undefined}
                          placeholder="super secret key"
                          value={header.value}
                          onChange={(v) => updateHeader(i, "value", v)}
                        />
                      </div>
                      <Button
                        variant="danger"
                        size="icon"
                        title="Remove Header"
                        onClick={() => removeHeader(i)}
                        className="mb-0.5"
                      >
                        <FontAwesomeIcon icon={faTrash} />
                      </Button>
                    </div>
                  ))}
                </div>
                <Button
                  variant="secondary"
                  title="Add Header"
                  onClick={addHeader}
                  disabled={(data.headers?.length ?? 0) >= 5}
                  className="w-full"
                >
                  <FontAwesomeIcon icon={faPlus} className="mr-1" /> Add Header
                </Button>
              </div>
            </div>
            <div className="p-4 flex justify-end border-t border-gray-700">
              <Button
                type="button"
                variant="success"
                visuallyDisabled={isLocked}
                aria-describedby={isLocked ? "integration-lock-banner" : undefined}
                onClick={handleSave}
              >
                Save
              </Button>
            </div>
          </div>

          {/* Placeholders */}
          <div className="bg-gray-800 rounded-xl overflow-hidden">
            <div className="p-4">
              <h2 className="text-xl font-medium">Placeholders</h2>
            </div>
            <hr className="border-gray-700" />
            <div className="p-4 flex flex-col gap-4">
              <p className="text-gray-400 text-sm">
                The response must contain a valid JSON payload. Values can be extracted to use as
                placeholders in welcome messages. Do <strong>not</strong> include{" "}
                <code className="bg-gray-700 px-1 rounded">%</code> symbols in placeholder names.
              </p>
              <p className="text-gray-400 text-sm">
                The JSON path uses dot notation (e.g.{" "}
                <code className="bg-gray-700 px-1 rounded">user.username</code>) to access nested
                objects.
              </p>

              <div className="flex flex-col gap-3">
                {(data.placeholders ?? []).map((placeholder, i) => (
                  <div key={i} className="flex gap-2 items-end">
                    <div className="flex-1">
                      <TextInput
                        label={i === 0 ? "Placeholder" : undefined}
                        placeholder="ingame_username"
                        value={placeholder.name}
                        onChange={(v) => updatePlaceholder(i, "name", v)}
                      />
                    </div>
                    <div className="flex-1">
                      <TextInput
                        label={i === 0 ? "JSON Path" : undefined}
                        placeholder="user.username"
                        value={placeholder.json_path}
                        onChange={(v) => updatePlaceholder(i, "json_path", v)}
                      />
                    </div>
                    <Button
                      variant="danger"
                      size="icon"
                      title="Remove Placeholder"
                      onClick={() => removePlaceholder(i)}
                      className="mb-0.5"
                    >
                      <FontAwesomeIcon icon={faTrash} />
                    </Button>
                  </div>
                ))}
              </div>

              <Button
                variant="secondary"
                onClick={addPlaceholder}
                disabled={(data.placeholders?.length ?? 0) >= 15}
                className="w-full"
              >
                <FontAwesomeIcon icon={faPlus} className="mr-1" /> Add Placeholder
              </Button>

              <div className="flex flex-col gap-2 mt-2">
                <h3 className="text-white font-medium">Example Response</h3>
                <p className="text-gray-400 text-sm">
                  The request must be responded to with a JSON payload in the following form:
                </p>
                <pre className="bg-gray-900 text-gray-200 text-xs p-3 rounded overflow-x-auto whitespace-pre-wrap">
                  {exampleJson}
                </pre>
              </div>
            </div>
          </div>
        </div>
      </div>

      <ConfirmModal
        isOpen={deleteModal}
        title="Delete Integration"
        message={`Are you sure you want to delete "${data.name}"? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        confirmVariant="danger"
        onConfirm={handleDelete}
        onCancel={() => setDeleteModal(false)}
      />

      <ConfirmModal
        isOpen={publicModal}
        title="Make Integration Public"
        message={`Are you sure you want to make "${data.name}" public? Everyone will be able to add it to their servers.`}
        confirmText="Confirm"
        cancelText="Cancel"
        onConfirm={handleMakePublic}
        onCancel={() => setPublicModal(false)}
      />
    </MainLayout>
  );
};

export default ManageIntegrationPage;
