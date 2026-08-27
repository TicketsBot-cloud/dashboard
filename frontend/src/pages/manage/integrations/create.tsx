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

type Step = "metadata" | "http";

const CreateIntegrationPage: FC = () => {
  let { guildId } = useParams();
  guildId = guildId!;

  const { selectGuild, selectedGuild } = useGuildStore();
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>("metadata");
  const [data, setData] = useState<Partial<Integration>>({
    name: "",
    description: "",
    image_url: null,
    privacy_policy_url: null,
    http_method: "GET",
    webhook_url: "",
    validation_url: null,
    placeholders: [{ name: "", json_path: "" }],
    secrets: [],
    headers: [],
  });

  const { locked: polledLock } = useFeatureLock(FEATURE_INTEGRATIONS, guildId);
  const [forcedLock, setForcedLock] = useState(false);
  const isLocked = forcedLock || polledLock === true;

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

  const updateField = <K extends keyof Integration>(key: K, value: Integration[K]) =>
    setData((prev) => ({ ...prev, [key]: value }));

  const addPlaceholder = () =>
    setData((prev) => ({
      ...prev,
      placeholders: [...(prev.placeholders ?? []), { name: "", json_path: "" }],
    }));

  const updatePlaceholder = (i: number, field: keyof IntegrationPlaceholder, val: string) =>
    setData((prev) => {
      const placeholders = [...(prev.placeholders ?? [])];
      placeholders[i] = {
        ...placeholders[i],
        [field]: field === "name" ? val.replace(/[ %]/g, "") : val,
      };
      return { ...prev, placeholders };
    });

  const removePlaceholder = (i: number) =>
    setData((prev) => ({
      ...prev,
      placeholders: (prev.placeholders ?? []).filter((_, idx) => idx !== i),
    }));

  const addSecret = () =>
    setData((prev) => ({
      ...prev,
      secrets: [...(prev.secrets ?? []), { name: "", description: "" }],
    }));

  const updateSecret = (i: number, field: keyof IntegrationSecret, val: string) =>
    setData((prev) => {
      const secrets = [...(prev.secrets ?? [])];
      secrets[i] = {
        ...secrets[i],
        [field]: field === "name" ? val.replace(/[ %]/g, "") : val,
      };
      return { ...prev, secrets };
    });

  const removeSecret = (i: number) =>
    setData((prev) => ({
      ...prev,
      secrets: (prev.secrets ?? []).filter((_, idx) => idx !== i),
    }));

  const addHeader = () =>
    setData((prev) => ({
      ...prev,
      headers: [...(prev.headers ?? []), { name: "", value: "" }],
    }));

  const updateHeader = (i: number, field: keyof IntegrationHeader, val: string) =>
    setData((prev) => {
      const headers = [...(prev.headers ?? [])];
      headers[i] = {
        ...headers[i],
        [field]: field === "name" ? val.replace(/ /g, "-") : val,
      };
      return { ...prev, headers };
    });

  const removeHeader = (i: number) =>
    setData((prev) => ({
      ...prev,
      headers: (prev.headers ?? []).filter((_, idx) => idx !== i),
    }));

  const handleCreate = async () => {
    const payload = {
      ...data,
      image_url: data.image_url || null,
      privacy_policy_url: data.privacy_policy_url || null,
      validation_url: data.validation_url || null,
    };
    try {
      const res = await apiClient.integrations.create(payload, SKIP_ERROR_TOAST);
      navigate(`/manage/${guildId}/integrations/view/${res.data.id}?created=true`);
    } catch (error) {
      const status = (error as { response?: { status?: number } })?.response?.status;
      const apiError = (error as { response?: { data?: { error?: string } } })?.response?.data
        ?.error;
      if (status === 503) {
        toast.warning(
          apiError ??
            "Integration management is temporarily unavailable. Please try again shortly.",
        );
        setForcedLock(true);
      } else {
        // SKIP_ERROR_TOAST opts out of the interceptor's toast for every status,
        // not just 503, so every other failure needs its own here.
        toast.error(apiError ?? "Failed to create integration. Please try again.");
      }
      console.error("Failed to create integration:", error);
    }
  };

  const metadataValid = (data.name?.length ?? 0) > 0 && (data.description?.length ?? 0) > 0;
  const exampleJson = buildExampleJson(data.placeholders ?? []);
  const firstSecret = data.secrets?.[0];

  return (
    <MainLayout
      title="Create Integration"
      subtitle="Build a custom integration to connect third-party services"
    >
      <FeatureLockBanner
        id="integration-lock-banner"
        locked={isLocked}
        featureLabel="Integration changes"
        existingLabel="integrations"
      />
      {/* Step indicator */}
      <div className="flex items-center gap-3 mb-6">
        <Button
          variant={step === "metadata" ? "primary" : "secondary"}
          size="sm"
          title="Metadata"
          onClick={() => setStep("metadata")}
          className="font-medium"
        >
          1. Metadata
        </Button>
        <span className="text-gray-600">›</span>
        <Button
          variant={step === "http" ? "primary" : "secondary"}
          size="sm"
          title="HTTP Config"
          onClick={() => metadataValid && setStep("http")}
          disabled={!metadataValid}
          className="font-medium"
        >
          2. HTTP Config
        </Button>
      </div>

      {/* Step 1 - Metadata */}
      {step === "metadata" && (
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
                value={(data.name ?? "").slice(0, 32)}
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
          <div className="p-4 flex justify-end border-t border-gray-700">
            <Button
              type="button"
              variant="primary"
              onClick={() => setStep("http")}
              disabled={!metadataValid}
            >
              Continue →
            </Button>
          </div>
        </div>
      )}

      {/* Step 2 - HTTP Config */}
      {step === "http" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* HTTP Request card */}
          <div className="bg-gray-800 rounded-xl overflow-hidden">
            <div className="p-4">
              <h2 className="text-xl font-medium">HTTP Request</h2>
            </div>
            <hr className="border-gray-700" />
            <div className="p-4 flex flex-col gap-6">
              {/* Endpoint */}
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
                    value={data.http_method ?? "GET"}
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
                      value={data.webhook_url ?? ""}
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
                  <code className="bg-gray-700 px-1 rounded">%</code> in secret names.
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
                        value={secret.description}
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

              {/* Validation */}
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
                  Up to 5 HTTP headers sent with the request. Use{" "}
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
                onClick={handleCreate}
              >
                Create Integration
              </Button>
            </div>
          </div>

          {/* Placeholders card */}
          <div className="bg-gray-800 rounded-xl overflow-hidden">
            <div className="p-4">
              <h2 className="text-xl font-medium">Placeholders</h2>
            </div>
            <hr className="border-gray-700" />
            <div className="p-4 flex flex-col gap-4">
              <p className="text-gray-400 text-sm">
                The response must contain a valid JSON payload. Values can be extracted to use as
                placeholders in welcome messages. Do <strong>not</strong> include{" "}
                <code className="bg-gray-700 px-1 rounded">%</code> in placeholder names.
              </p>
              <p className="text-gray-400 text-sm">
                Use dot notation for JSON paths (e.g.{" "}
                <code className="bg-gray-700 px-1 rounded">user.username</code>).
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
                title="Add Placeholder"
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
      )}
    </MainLayout>
  );
};

export default CreateIntegrationPage;
