import { useEffect, useRef, useState, type FC } from "react";
import { useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { apiClient, SKIP_ERROR_TOAST } from "@/lib/api";
import { getGuildById } from "@/stores/auth";
import { useGuildStore } from "@/stores/guild";
import { MainLayout } from "@/pages/layout/Main";
import Button from "@/components/Button";
import ConfirmModal from "@/components/modals/ConfirmModal";
import TextInput from "@/components/TextInput";
import FeatureLockBanner from "@/components/FeatureLockBanner";
import { useFeatureLock } from "@/hooks/useFeatureLock";
import { FEATURE_INTEGRATIONS } from "@/lib/feature-flags";
import type { Integration } from "@/types";

const ViewIntegrationPage: FC = () => {
  let { guildId, integration: integrationId } = useParams();
  guildId = guildId!;
  integrationId = integrationId!;

  const { selectGuild, selectedGuild } = useGuildStore();
  const navigate = useNavigate();

  const [integration, setIntegration] = useState<Integration | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [privacyPolicyUrl, setPrivacyPolicyUrl] = useState<string | null>(null);
  const [removeModal, setRemoveModal] = useState(false);
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

  useEffect(() => {
    const load = async () => {
      try {
        const [viewRes, statusRes] = await Promise.all([
          apiClient.integrations.view(integrationId),
          apiClient.integrations.getGuildStatus(guildId, integrationId),
        ]);

        const data = viewRes.data;
        setIntegration(data);
        setIsActive(statusRes.data.active);

        if (data.privacy_policy_url) {
          try {
            const url = new URL(data.privacy_policy_url);
            if (url.protocol === "http:" || url.protocol === "https:") {
              setPrivacyPolicyUrl(data.privacy_policy_url);
            }
          } catch {
            // invalid URL - ignore
          }
        }
      } catch {
        // error handled by interceptor
      }
    };

    load();
  }, [guildId, integrationId]);

  const handleRemove = async () => {
    try {
      await apiClient.integrations.removeFromGuild(guildId, integrationId, SKIP_ERROR_TOAST);
      toast.success("Integration removed from server");
      navigate(`/manage/${guildId}/integrations`);
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
        toast.error(apiError ?? "Failed to remove integration. Please try again.");
      }
      console.error("Failed to remove integration:", error);
    }
    setRemoveModal(false);
  };

  if (!integration) {
    return (
      <MainLayout title="Integration">
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

  return (
    <MainLayout title={`About ${integration.name}`} subtitle="Integration details and placeholders">
      <FeatureLockBanner
        id="integration-lock-banner"
        locked={isLocked}
        featureLabel="Integration changes"
        existingLabel="integrations"
      />
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left - About */}
        <div className="lg:col-span-3 bg-gray-800 rounded-xl overflow-hidden">
          <div className="p-4">
            <h2 className="text-xl font-medium">About {integration.name}</h2>
          </div>
          <hr className="border-gray-700" />
          <div className="p-4 flex flex-col gap-4">
            <p className="text-gray-300 border-b border-gray-700 pb-4">{integration.description}</p>

            <div>
              <p className="text-gray-400 text-sm mb-1">
                When a user opens a ticket, a request containing the ticket opener's user ID will be
                sent to the following URL, controlled by the integration author:
              </p>
              <TextInput value={integration.webhook_url} onChange={() => {}} disabled />
            </div>

            <p className="text-gray-400 text-sm">
              {privacyPolicyUrl ? (
                <>
                  The integration author has provided a privacy policy, accessible at{" "}
                  <a
                    href={privacyPolicyUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-400 hover:text-blue-300 break-all"
                  >
                    {privacyPolicyUrl}
                  </a>
                </>
              ) : (
                "The integration author has not provided a privacy policy."
              )}
            </p>

            <div className="pt-2">
              {isActive ? (
                <Button
                  variant="danger"
                  visuallyDisabled={isLocked}
                  aria-describedby={isLocked ? "integration-lock-banner" : undefined}
                  onClick={() => setRemoveModal(true)}
                >
                  Remove from server
                </Button>
              ) : (
                <Button
                  variant="primary"
                  onClick={() =>
                    navigate(`/manage/${guildId}/integrations/activate/${integrationId}`)
                  }
                >
                  Add to server
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Right - Placeholders */}
        <div className="lg:col-span-2 bg-gray-800 rounded-xl overflow-hidden">
          <div className="p-4">
            <h2 className="text-xl font-medium">Placeholders</h2>
          </div>
          <hr className="border-gray-700" />
          <div className="p-4 flex flex-col gap-3">
            <p className="text-gray-400 text-sm">
              The following placeholders are available to use in welcome messages through the{" "}
              <em>{integration.name}</em> integration:
            </p>
            {integration.placeholders && integration.placeholders.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {integration.placeholders.map((p) => (
                  <span
                    key={p.name}
                    className="bg-gray-700 text-gray-200 text-xs px-2 py-1 rounded font-mono"
                  >
                    %{p.name}%
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-sm">No placeholders defined.</p>
            )}
          </div>
        </div>
      </div>

      <ConfirmModal
        isOpen={removeModal}
        title="Remove Integration"
        message={`Are you sure you want to remove "${integration.name}" from this server?`}
        confirmText="Remove"
        cancelText="Cancel"
        confirmVariant="danger"
        onConfirm={handleRemove}
        onCancel={() => setRemoveModal(false)}
      />
    </MainLayout>
  );
};

export default ViewIntegrationPage;
