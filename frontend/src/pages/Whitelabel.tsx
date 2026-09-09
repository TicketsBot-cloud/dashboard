import { useState, useEffect, useCallback, useRef } from "react";
import { MainLayout } from "@/pages/layout/Main";
import Button from "@/components/Button";
import Table from "@/components/Table";
import TextInput from "@/components/TextInput";
import Select from "@/components/Select";
import ConfirmModal from "@/components/modals/ConfirmModal";
import FeatureLockBanner from "@/components/FeatureLockBanner";
import { apiClient, SKIP_ERROR_TOAST } from "@/lib/api";
import { toast } from "sonner";
import { useFeatureLock } from "@/hooks/useFeatureLock";
import { FEATURE_WHITELABEL } from "@/lib/feature-flags";
import type { WhitelabelBot, WhitelabelError } from "@/types";
import { useApiErrorHandler } from "@/hooks/useApiErrorHandler";

const statusTypeOptions = [
  { key: "0", label: "Playing" },
  { key: "2", label: "Listening" },
  { key: "3", label: "Watching" },
  { key: "5", label: "Competing" },
  { key: "4", label: "Custom" },
];

export default function Whitelabel() {
  const [active, setActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState("");
  const [bot, setBot] = useState<WhitelabelBot>({
    id: "",
    username: "",
    status: "",
    status_type: "0",
  });
  const [fetchedStatus, setFetchedStatus] = useState("");
  const [errors, setErrors] = useState<WhitelabelError[]>([]);
  const [showDisableModal, setShowDisableModal] = useState(false);
  const [isResyncing, setIsResyncing] = useState(false);
  const [showResyncModal, setShowResyncModal] = useState(false);

  // Whitelabel configuration is not guild-scoped (this page sits outside
  // /manage/:guildId), so the flag is read account-wide: only staff, percentage
  // of dashboard users, and the environment toggle can ever match here.
  const { locked: polledLock } = useFeatureLock(FEATURE_WHITELABEL);
  const [forcedLock, setForcedLock] = useState(false);
  const handleApiError = useApiErrorHandler(
    "Whitelabel changes are temporarily unavailable. Please try again shortly.",
    setForcedLock,
  );
  const isLocked = forcedLock || polledLock === true;

  // This page is a long-lived settings screen rather than a form the user
  // navigates away from after one submit, so a forced lock from a 503 must
  // release once the poll confirms the flag is back on, otherwise the page
  // stays locked forever after a single incident even though the flag was
  // re-enabled.
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
      toast.success("Whitelabel changes are available again.");
    }
    previousLockRef.current = isLocked;
  }, [isLocked]);

  const loadErrors = useCallback(async () => {
    try {
      const res = await apiClient.whitelabel.getErrors();
      if (res.data.errors) {
        setErrors(res.data.errors);
      }
    } catch {
      // Interceptor handles error display
    }
  }, []);

  useEffect(() => {
    const loadBot = async () => {
      try {
        const res = await apiClient.whitelabel.get();
        if (res.status === 200) {
          setBot(res.data);
          setFetchedStatus(res.data.status || "");
          setActive(true);
          await loadErrors();
        }
        // 404 - no whitelabel bot, just show token form
      } catch {
        // 401/402/429 handled by interceptor
      } finally {
        setLoading(false);
      }
    };

    loadBot();
  }, [loadErrors]);

  const submitToken = async () => {
    try {
      const res = await apiClient.whitelabel.create(token, SKIP_ERROR_TOAST);
      setToken("");
      toast.success(`Started tickets whitelabel on ${res.data.username}`);

      // Reload bot data. Nested so a failure here (the bot now exists, but its
      // details could not be fetched back) doesn't fall into the outer catch and
      // contradict the success toast above with a "failed to start" error - the
      // token form would also reappear despite the token already being consumed
      // and unrecoverable.
      try {
        const botRes = await apiClient.whitelabel.get();
        setBot(botRes.data);
        setFetchedStatus(botRes.data.status || "");
        setActive(true);
        await loadErrors();
      } catch (reloadError) {
        console.error("Failed to reload whitelabel bot after creation:", reloadError);
        setActive(true);
        toast.warning(
          "Whitelabel started but the bot details could not be loaded. Please refresh.",
        );
      }
    } catch (error) {
      handleApiError(
        error,
        "Failed to start whitelabel. Please check your bot token and try again.",
      );
      console.error("Failed to start whitelabel:", error);
    }
  };

  const generateInvite = async () => {
    try {
      const res = await apiClient.whitelabel.get();
      const inviteUrl = `https://discord.com/oauth2/authorize?client_id=${res.data.id}&scope=bot+applications.commands&permissions=805825784`;
      window.open(inviteUrl, "_blank");
    } catch {
      // Interceptor handles error display
    }
  };

  const resyncBot = async () => {
    setShowResyncModal(false);
    setIsResyncing(true);
    try {
      await apiClient.whitelabel.resync(SKIP_ERROR_TOAST);
      toast.success("Bot resynced. Slash commands may take a few minutes before they are visible.");

      // Refresh the server count without clobbering an unsaved status edit. Nested
      // so a failure here (the resync itself already succeeded) can't be reported
      // back as "failed to resync" or force-lock the page off a read-path error.
      try {
        const res = await apiClient.whitelabel.get();
        setBot((prev) => ({ ...prev, guild_count: res.data.guild_count }));
      } catch (reloadError) {
        console.error("Failed to refresh server count after resync:", reloadError);
      }
    } catch (error) {
      handleApiError(error, "Failed to resync bot. Please try again.");
      console.error("Failed to resync bot:", error);
    } finally {
      setIsResyncing(false);
    }
  };

  const disableWhitelabel = async () => {
    setShowDisableModal(false);
    try {
      await apiClient.whitelabel.delete(SKIP_ERROR_TOAST);
      setActive(false);
      toast.success("Whitelabel has been disabled");
    } catch (error) {
      handleApiError(error, "Failed to disable whitelabel. Please try again.");
      console.error("Failed to disable whitelabel:", error);
    }
  };

  const updateStatus = async () => {
    try {
      await apiClient.whitelabel.updateStatus(bot.status, bot.status_type, SKIP_ERROR_TOAST);
      setFetchedStatus(bot.status);
      toast.success("Updated status successfully");
    } catch (error) {
      handleApiError(error, "Failed to update status. Please try again.");
      console.error("Failed to update status:", error);
    }
  };

  const clearStatus = async () => {
    try {
      await apiClient.whitelabel.deleteStatus(SKIP_ERROR_TOAST);
      setBot((prev) => ({ ...prev, status: "", status_type: "0" }));
      setFetchedStatus("");
      toast.success("Deleted status successfully");
    } catch (error) {
      handleApiError(error, "Failed to delete status. Please try again.");
      console.error("Failed to delete status:", error);
    }
  };

  if (loading) {
    return (
      <MainLayout title="Whitelabel">
        <FeatureLockBanner
          id="whitelabel-lock-banner"
          locked={isLocked}
          featureLabel="Whitelabel changes"
          existingLabel="whitelabel settings"
        />
        <div className="flex items-center justify-center min-h-50">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout title="Whitelabel">
      <FeatureLockBanner
        id="whitelabel-lock-banner"
        locked={isLocked}
        featureLabel="Whitelabel changes"
        existingLabel="whitelabel settings"
      />
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Left Column */}
        <div className="flex flex-col gap-6 lg:w-1/2">
          {active ? (
            <>
              {/* Manage Bot Card */}
              <div className="bg-gray-800 rounded-lg p-6">
                <h2 className="text-lg font-semibold text-white mb-4">Manage Bot</h2>
                <p className="text-gray-300 mb-4">
                  Your whitelabel bot <strong>{bot.username}</strong> is active
                  {bot.guild_count !== undefined && (
                    <>
                      {" "}
                      in <strong>{bot.guild_count}</strong> server{bot.guild_count === 1 ? "" : "s"}
                    </>
                  )}
                  .
                </p>
                <div className="flex flex-col sm:flex-row gap-3">
                  <Button variant="primary" onClick={generateInvite}>
                    Generate Invite Link
                  </Button>
                  <Button
                    variant="primary"
                    onClick={() => setShowResyncModal(true)}
                    isLoading={isResyncing}
                    visuallyDisabled={isLocked}
                    aria-describedby={isLocked ? "whitelabel-lock-banner" : undefined}
                  >
                    Resync Bot
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() => setShowDisableModal(true)}
                    visuallyDisabled={isLocked}
                    aria-describedby={isLocked ? "whitelabel-lock-banner" : undefined}
                  >
                    Disable Whitelabel
                  </Button>
                </div>
              </div>

              {/* Custom Status Card */}
              <div className="bg-gray-800 rounded-lg p-6">
                <h2 className="text-lg font-semibold text-white mb-4">Custom Status</h2>
                <div className="flex flex-col sm:flex-row gap-3 mb-4">
                  <div className="sm:w-1/3">
                    <Select
                      label="Status Type"
                      value={bot.status_type}
                      options={statusTypeOptions}
                      onChange={(value) =>
                        setBot((prev) => ({ ...prev, status_type: value ?? prev.status_type }))
                      }
                    />
                  </div>
                  <div className="sm:w-2/3">
                    <TextInput
                      label="Status Text"
                      value={bot.status}
                      onChange={(value) => setBot((prev) => ({ ...prev, status: value }))}
                      placeholder="/help"
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-3">
                  <Button
                    variant="primary"
                    onClick={updateStatus}
                    className="w-full justify-center"
                    visuallyDisabled={isLocked}
                    aria-describedby={isLocked ? "whitelabel-lock-banner" : undefined}
                  >
                    Submit
                  </Button>
                  {fetchedStatus !== "" && (
                    <Button
                      variant="danger"
                      onClick={clearStatus}
                      className="w-full justify-center"
                      visuallyDisabled={isLocked}
                      aria-describedby={isLocked ? "whitelabel-lock-banner" : undefined}
                    >
                      Clear Status
                    </Button>
                  )}
                </div>
              </div>
            </>
          ) : (
            /* Bot Token Card */
            <div className="bg-gray-800 rounded-lg p-6">
              <h2 className="text-lg font-semibold text-white mb-4">Bot Token</h2>
              <TextInput
                label="Bot Token"
                value={token}
                onChange={setToken}
                placeholder="xxxxxxxxxxxxxxxxxxxxxxxx.xxxxxx.xxxxxxxxxxxxxxxxxxxxxxxxxxx"
              />
              <p className="text-gray-300 text-sm mt-2 mb-4">
                Note: You will not be able to view the token after submitting it
              </p>
              <Button
                variant="primary"
                onClick={submitToken}
                className="w-full justify-center"
                visuallyDisabled={isLocked}
                aria-describedby={isLocked ? "whitelabel-lock-banner" : undefined}
              >
                Submit
              </Button>
            </div>
          )}
        </div>

        {/* Right Column */}
        <div className="lg:w-1/2">
          <div className="bg-gray-800 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Error Log</h2>
            <Table>
              <Table.Head>
                <Table.Row>
                  <Table.HeaderCell>Error</Table.HeaderCell>
                  <Table.HeaderCell>Time</Table.HeaderCell>
                </Table.Row>
              </Table.Head>
              <Table.Body>
                {errors.length > 0 ? (
                  errors.map((error, index) => (
                    <Table.Row key={index}>
                      <Table.Cell>{error.message}</Table.Cell>
                      <Table.Cell>{new Date(error.time).toLocaleString()}</Table.Cell>
                    </Table.Row>
                  ))
                ) : (
                  <Table.Row>
                    <Table.Cell colSpan={2} className="text-gray-500 py-4 px-3 text-center">
                      No errors recorded
                    </Table.Cell>
                  </Table.Row>
                )}
              </Table.Body>
            </Table>
          </div>
        </div>
      </div>

      <ConfirmModal
        isOpen={showResyncModal}
        title="Resync Bot"
        message="This will reapply your bot token, re-register its slash commands, and refresh the list of servers it's in. Continue?"
        confirmText="Resync"
        confirmVariant="primary"
        onConfirm={resyncBot}
        onCancel={() => setShowResyncModal(false)}
      />

      <ConfirmModal
        isOpen={showDisableModal}
        title="Disable Whitelabel"
        message="Are you sure you want to disable your whitelabel bot? This action cannot be undone."
        confirmText="Disable"
        confirmVariant="danger"
        onConfirm={disableWhitelabel}
        onCancel={() => setShowDisableModal(false)}
      />
    </MainLayout>
  );
}
