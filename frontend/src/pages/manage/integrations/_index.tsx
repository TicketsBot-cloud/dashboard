import { useEffect, useRef, useState, type FC } from "react";
import { userAvatarUrl } from "@/lib/discord-cdn";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { apiClient, SKIP_ERROR_TOAST } from "@/lib/api";
import { getGuildById } from "@/stores/auth";
import { useGuildStore } from "@/stores/guild";
import { MainLayout } from "@/pages/layout/Main";
import Button from "@/components/Button";
import ConfirmModal from "@/components/modals/ConfirmModal";
import ImageWithFallback from "@/components/ImageWithFallback";
import FeatureLockBanner from "@/components/FeatureLockBanner";
import { useFeatureLock } from "@/hooks/useFeatureLock";
import { FEATURE_INTEGRATIONS } from "@/lib/feature-flags";
import type { Integration } from "@/types";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus, faServer, faEye, faCog, faTrash } from "@fortawesome/free-solid-svg-icons";
import CardGridSkeleton from "@/components/skeletons/CardGridSkeleton";
import Pagination from "@/components/Pagination";

function generateProxyUrl(integration: Integration): string | null {
  if (!integration.image_url || !integration.proxy_token) return null;
  return `https://image-cdn.tickets.bot/proxy?token=${integration.proxy_token}`;
}

interface IntegrationCardProps {
  integration: Integration;
  guildId: string;
  owned?: boolean;
  showAuthor?: boolean;
  onRemove?: () => void;
  removeLocked?: boolean;
}

const IntegrationCard: FC<IntegrationCardProps> = ({
  integration,
  guildId,
  owned = false,
  showAuthor = false,
  onRemove,
  removeLocked = false,
}) => {
  const navigate = useNavigate();
  const imageUrl = generateProxyUrl(integration);

  return (
    <div className="bg-gray-700 rounded-xl overflow-hidden flex flex-col h-full">
      <ImageWithFallback
        src={imageUrl}
        alt={integration.name}
        className="w-full h-32 shrink-0"
        fallbackClassName="bg-gray-600"
        fallbackIconClassName="text-gray-400 text-3xl"
      />
      <div className="p-4 flex flex-col flex-1">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <span className="font-semibold text-white text-base">{integration.name}</span>
          {integration.added && (
            <span className="bg-green-700 text-green-100 text-xs px-2 py-0.5 rounded">Active</span>
          )}
          {integration.guild_count !== undefined && (
            <span className="bg-gray-600 text-gray-300 text-xs px-2 py-0.5 rounded flex items-center gap-1">
              <FontAwesomeIcon icon={faServer} className="text-xs" />
              {integration.guild_count}
            </span>
          )}
        </div>

        {showAuthor && (
          <div className="flex items-center gap-1 mb-1">
            {integration.author ? (
              <>
                <img
                  src={userAvatarUrl(integration.author.id, integration.author.avatar)}
                  alt="Author"
                  className="w-5 h-5 rounded-full"
                />
                <span className="text-gray-400 text-xs">
                  {integration.author.global_name || integration.author.username}
                </span>
              </>
            ) : (
              <span className="text-gray-400 text-xs">Unknown author</span>
            )}
          </div>
        )}

        <p className="text-gray-400 text-sm flex-1 mb-3">{integration.description}</p>

        <div className="flex gap-2 flex-wrap">
          {integration.added ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate(`/manage/${guildId}/integrations/view/${integration.id}`)}
              >
                <FontAwesomeIcon icon={faEye} className="mr-1" />
                View
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  navigate(`/manage/${guildId}/integrations/configure/${integration.id}`)
                }
              >
                <FontAwesomeIcon icon={faCog} className="mr-1" />
                Configure
              </Button>
              {onRemove && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-400 hover:text-red-300"
                  visuallyDisabled={removeLocked}
                  aria-describedby={removeLocked ? "integration-lock-banner" : undefined}
                  onClick={onRemove}
                >
                  <FontAwesomeIcon icon={faTrash} className="mr-1" />
                  Remove
                </Button>
              )}
            </>
          ) : (
            <>
              {owned ? (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      navigate(`/manage/${guildId}/integrations/view/${integration.id}`)
                    }
                  >
                    Preview
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      navigate(`/manage/${guildId}/integrations/manage/${integration.id}`)
                    }
                  >
                    <FontAwesomeIcon icon={faCog} className="mr-1" />
                    Manage
                  </Button>
                </>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate(`/manage/${guildId}/integrations/view/${integration.id}`)}
                >
                  View
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  navigate(`/manage/${guildId}/integrations/activate/${integration.id}`)
                }
              >
                Add to server
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

const IntegrationsPage: FC = () => {
  let { guildId } = useParams();
  guildId = guildId!;

  const { selectGuild, selectedGuild } = useGuildStore();

  const [ownedIntegrations, setOwnedIntegrations] = useState<Integration[]>([]);
  const [availableIntegrations, setAvailableIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [removeModal, setRemoveModal] = useState<{
    isOpen: boolean;
    id: string;
    name: string;
  } | null>(null);
  const { locked: polledLock } = useFeatureLock(FEATURE_INTEGRATIONS, guildId);
  const [forcedLock, setForcedLock] = useState(false);
  const isLocked = forcedLock || polledLock === true;

  // This page is a long-lived list rather than a form the user navigates away
  // from after one submit, so a forced lock from a 503 must release once the
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
    const loadOwned = async () => {
      try {
        const res = await apiClient.integrations.listOwned();
        setOwnedIntegrations(res.data || []);
      } catch {
        // error handled by interceptor
      }
    };

    const loadAvailable = async () => {
      try {
        const res = await apiClient.integrations.listAvailable(guildId, page);
        setAvailableIntegrations(res.data.integrations || []);
        setTotalPages(res.data.total_pages || 1);
      } catch {
        // error handled by interceptor
      }
    };

    setLoading(true);
    Promise.all([loadOwned(), loadAvailable()]).finally(() => setLoading(false));
  }, [guildId, page]);

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
  };

  const handleRemove = async () => {
    if (!removeModal) return;
    try {
      await apiClient.integrations.removeFromGuild(guildId, removeModal.id, SKIP_ERROR_TOAST);
      toast.success("Integration removed from server");
      setPage((p) => p); // trigger re-fetch via useEffect
      setAvailableIntegrations((prev) =>
        prev.map((i) => (i.id === removeModal.id ? { ...i, added: false } : i)),
      );
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
    setRemoveModal(null);
  };

  if (loading) {
    return (
      <MainLayout
        title={`Integrations for ${selectedGuild?.name || "loading..."}`}
        subtitle="Connect third-party services to enhance your ticket bot"
      >
        <FeatureLockBanner
          id="integration-lock-banner"
          locked={isLocked}
          featureLabel="Integration changes"
          existingLabel="integrations"
        />
        <CardGridSkeleton cards={3} sections={2} />
      </MainLayout>
    );
  }

  return (
    <MainLayout
      title={`Integrations for ${selectedGuild?.name || "loading..."}`}
      subtitle="Connect third-party services to enhance your ticket bot"
    >
      <FeatureLockBanner
        id="integration-lock-banner"
        locked={isLocked}
        featureLabel="Integration changes"
        existingLabel="integrations"
      />
      {/* My Integrations */}
      <div className="bg-gray-800 rounded-xl overflow-hidden mb-6">
        <div className="flex items-center justify-between p-4">
          <h2 className="text-xl font-medium">My Integrations</h2>
          <Link to={isLocked ? "#" : `/manage/${guildId}/integrations/create`}>
            <Button variant="primary" disabled={isLocked}>
              <FontAwesomeIcon icon={faPlus} className="mr-1" /> Create Integration
            </Button>
          </Link>
        </div>
        <hr className="border-gray-700" />
        <div className="p-4">
          {ownedIntegrations.length === 0 ? (
            <p className="text-gray-400 text-center py-6">
              You haven't created any integrations yet.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {ownedIntegrations.map((integration) => (
                <IntegrationCard
                  key={integration.id}
                  integration={integration}
                  guildId={guildId}
                  owned
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Available Integrations */}
      <div className="bg-gray-800 rounded-xl overflow-hidden">
        <div className="p-4">
          <h2 className="text-xl font-medium">Available Integrations</h2>
        </div>
        <hr className="border-gray-700" />
        <div className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {availableIntegrations.map((integration) => (
              <IntegrationCard
                key={integration.id}
                integration={integration}
                guildId={guildId}
                showAuthor
                removeLocked={isLocked}
                onRemove={
                  integration.added
                    ? () =>
                        setRemoveModal({
                          isOpen: true,
                          id: integration.id,
                          name: integration.name,
                        })
                    : undefined
                }
              />
            ))}
          </div>

          {/* Pagination */}
          <Pagination
            variant="full"
            page={page}
            totalPages={totalPages}
            onChange={handlePageChange}
            disabled={loading}
          />
        </div>
      </div>

      <ConfirmModal
        isOpen={!!removeModal}
        title="Remove Integration"
        message={`Are you sure you want to remove "${removeModal?.name}" from this server?`}
        confirmText="Remove"
        cancelText="Cancel"
        confirmVariant="danger"
        onConfirm={handleRemove}
        onCancel={() => setRemoveModal(null)}
      />
    </MainLayout>
  );
};

export default IntegrationsPage;
