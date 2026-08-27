import { useEffect, useRef, useState, type FC } from "react";
import { useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { apiClient, SKIP_ERROR_TOAST } from "@/lib/api";
import { getGuildById } from "@/stores/auth";
import { useGuildStore } from "@/stores/guild";
import { MainLayout } from "@/pages/layout/Main";
import Button from "@/components/Button";
import TextInput from "@/components/TextInput";
import FeatureLockBanner from "@/components/FeatureLockBanner";
import { useFeatureLock } from "@/hooks/useFeatureLock";
import { FEATURE_INTEGRATIONS } from "@/lib/feature-flags";
import type { Integration } from "@/types";

const ActivateIntegrationPage: FC = () => {
  let { guildId, integration: integrationId } = useParams();
  guildId = guildId!;
  integrationId = integrationId!;

  const { selectGuild, selectedGuild } = useGuildStore();
  const navigate = useNavigate();

  const [integration, setIntegration] = useState<Integration | null>(null);
  const [secretValues, setSecretValues] = useState<Record<string, string>>({});
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
        const res = await apiClient.integrations.view(integrationId);
        setIntegration(res.data);
      } catch {
        // error handled by interceptor
      }
    };
    load();
  }, [integrationId]);

  const allFilled =
    !integration?.secrets ||
    integration.secrets.length === 0 ||
    (Object.keys(secretValues).length === integration.secrets.length &&
      Object.values(secretValues).every((v) => v.length > 0));

  const handleActivate = async () => {
    try {
      await apiClient.integrations.addToGuild(
        guildId,
        integrationId,
        secretValues,
        SKIP_ERROR_TOAST,
      );
      navigate(`/manage/${guildId}/integrations?added=true`);
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
        toast.error(apiError ?? "Failed to add integration. Please try again.");
      }
      console.error("Failed to activate integration:", error);
    }
  };

  if (!integration) {
    return (
      <MainLayout title="Add Integration">
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
    <MainLayout
      title={`Add ${integration.name} To Your Server`}
      subtitle="Provide the required details to activate this integration"
    >
      <FeatureLockBanner
        id="integration-lock-banner"
        locked={isLocked}
        featureLabel="Integration changes"
        existingLabel="integrations"
      />
      <div className="flex justify-center">
        <div className="w-full max-w-2xl bg-gray-800 rounded-xl overflow-hidden">
          <div className="p-4">
            <h2 className="text-xl font-medium">Secrets</h2>
          </div>
          <hr className="border-gray-700" />
          <div className="p-4 flex flex-col gap-4">
            {!integration.secrets || integration.secrets.length === 0 ? (
              <p className="text-gray-400">This integration does not require any secrets.</p>
            ) : (
              <>
                <p className="text-gray-400 text-sm">
                  This integration requires you to provide some secrets. These will be sent to the
                  server controlled by the creator of <strong>{integration.name}</strong>, at:{" "}
                  <code className="bg-gray-700 px-1 rounded text-xs">
                    {integration.webhook_url}
                  </code>
                </p>
                <p className="text-gray-500 text-xs">
                  Note: the integration creator may change the server at any time.
                </p>

                <div className="flex flex-col gap-4">
                  {integration.secrets.map((secret) => (
                    <div key={secret.name} className="flex flex-col gap-1">
                      <TextInput
                        label={secret.name}
                        placeholder={secret.name}
                        value={secretValues[secret.name] ?? ""}
                        onChange={(val) =>
                          setSecretValues((prev) => ({ ...prev, [secret.name]: val }))
                        }
                      />
                      {secret.description && (
                        <p className="text-gray-500 text-xs">{secret.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
          <div className="p-4 flex justify-end border-t border-gray-700">
            <Button
              variant="success"
              disabled={!allFilled}
              visuallyDisabled={isLocked}
              aria-describedby={isLocked ? "integration-lock-banner" : undefined}
              onClick={handleActivate}
            >
              Add to server
            </Button>
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

export default ActivateIntegrationPage;
