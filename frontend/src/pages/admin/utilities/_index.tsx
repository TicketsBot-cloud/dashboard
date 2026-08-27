import { useState, useEffect, useCallback, useRef } from "react";
import Button from "@/components/Button";
import Checkbox from "@/components/Checkbox";
import Collapsible from "@/components/Collapsible";
import ConfirmModal from "@/components/modals/ConfirmModal";
import { apiClient } from "@/lib/api";
import { toast } from "sonner";
import { useAuthStore } from "@/stores/auth";
import { isAtLeast } from "@/lib/admin-tier";
import type { WhitelabelRecreateStatus } from "@/types";

type ConfirmAction = "main" | "whitelabel";

export default function AdminUtilitiesPage() {
  const { user } = useAuthStore();
  const isOwner = isAtLeast(user?.admin_tier ?? "", "owner");

  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [adminOnly, setAdminOnly] = useState(false);
  const [isMainLoading, setIsMainLoading] = useState(false);
  const [wlStatus, setWlStatus] = useState<WhitelabelRecreateStatus | null>(null);
  const [isStartingWl, setIsStartingWl] = useState(false);

  const isWlRunning = wlStatus?.status === "running";
  const wasRunningRef = useRef(false);

  const pollStatus = useCallback(async () => {
    try {
      const res = await apiClient.admin.utilities.whitelabelRecreateStatus();
      setWlStatus(res.data);
    } catch {
      // Error handled by interceptor
    }
  }, []);

  // Reflect any in-progress job on mount.
  useEffect(() => {
    if (isOwner) pollStatus();
  }, [isOwner, pollStatus]);

  // Poll while a job is running.
  useEffect(() => {
    if (!isWlRunning) return;
    const id = setInterval(pollStatus, 2000);
    return () => clearInterval(id);
  }, [isWlRunning, pollStatus]);

  // Toast once when a run we started (or observed running) finishes.
  useEffect(() => {
    if (wlStatus?.status === "running") {
      wasRunningRef.current = true;
    } else if (wlStatus?.status === "completed" && wasRunningRef.current) {
      wasRunningRef.current = false;
      toast.success(
        `Whitelabel commands re-created: ${wlStatus.succeeded} succeeded, ${wlStatus.failed} failed.`,
      );
    }
  }, [wlStatus]);

  const handleRecreateMain = async () => {
    setConfirmAction(null);
    setIsMainLoading(true);
    try {
      const { data } = await apiClient.admin.utilities.recreateMainCommands(adminOnly);
      if (data.admin_only) {
        toast.success(`Re-created ${data.admin_count} admin command(s).`);
      } else if (data.admin_skipped) {
        toast.success(
          `Re-created ${data.global_count} command(s). Admin guild not configured — admin commands skipped.`,
        );
      } else {
        toast.success(
          `Re-created ${data.global_count} global + ${data.admin_count} admin command(s).`,
        );
      }
    } catch {
      // Error handled by interceptor
    } finally {
      setIsMainLoading(false);
    }
  };

  const handleRecreateWhitelabel = async () => {
    setConfirmAction(null);
    setIsStartingWl(true);
    try {
      const res = await apiClient.admin.utilities.recreateAllWhitelabel();
      if (res.status === 409) {
        toast.info("A whitelabel command recreation is already running.");
      } else {
        toast.success(`Started re-creating commands for ${res.data.total} whitelabel bot(s).`);
      }
      await pollStatus();
    } catch {
      // Error handled by interceptor
    } finally {
      setIsStartingWl(false);
    }
  };

  const onConfirm = () => {
    if (confirmAction === "main") return handleRecreateMain();
    if (confirmAction === "whitelabel") return handleRecreateWhitelabel();
  };

  if (!isOwner) {
    return (
      <p className="text-gray-400 text-center py-8">
        You do not have permission to view this page.
      </p>
    );
  }

  const confirmCopy = (() => {
    if (confirmAction === "whitelabel") {
      return {
        title: "Re-create all whitelabel commands",
        message:
          "This re-registers slash commands for every whitelabel bot. It runs in the background and may take a while depending on how many bots exist. Continue?",
        confirmText: "Re-create all",
      };
    }
    if (confirmAction === "main") {
      return {
        title: "Re-create main bot commands",
        message: adminOnly
          ? "This overwrites the main bot's admin/helper slash commands in the configured admin guild. Continue?"
          : "This overwrites the main bot's global slash commands, plus the admin/helper commands if an admin guild is configured. Continue?",
        confirmText: "Re-create",
      };
    }
    return { title: "", message: "", confirmText: "Confirm" };
  })();

  const showWlProgress = wlStatus != null && wlStatus.status !== "idle";
  const wlPct =
    wlStatus && wlStatus.total > 0 ? Math.round((wlStatus.processed / wlStatus.total) * 100) : 0;

  return (
    <div>
      <header className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-semibold mb-2 text-center">Utilities</h1>
        <p className="text-center text-gray-400 text-sm sm:text-base">
          Owner-only maintenance actions
        </p>
      </header>

      {/* Main bot commands */}
      <Collapsible
        title="Main bot slash commands"
        subtitle="Re-register the main bot's commands. Admin commands are included when an admin guild is configured."
        defaultOpen
      >
        <div className="flex flex-col-reverse items-center sm:flex-row sm:justify-between gap-4">
          <Button
            variant="primary"
            onClick={() => setConfirmAction("main")}
            isLoading={isMainLoading}
          >
            {adminOnly ? "Re-create admin commands" : "Re-create main bot commands"}
          </Button>
          <Checkbox
            checked={adminOnly}
            onChange={setAdminOnly}
            label="Only re-create admin commands"
          />
        </div>
      </Collapsible>

      {/* Whitelabel commands */}
      <Collapsible
        title="Whitelabel bot slash commands"
        subtitle="Re-register slash commands for every whitelabel bot. Runs in the background."
        defaultOpen
      >
        <div className="flex justify-center sm:justify-start">
          <Button
            variant="purple"
            onClick={() => setConfirmAction("whitelabel")}
            isLoading={isStartingWl}
            disabled={isWlRunning}
          >
            {isWlRunning ? "Running..." : "Re-create all whitelabel commands"}
          </Button>
        </div>

        {showWlProgress && (
          <div className="mt-4">
            <div className="flex justify-between text-sm text-gray-400 mb-1">
              <span>{isWlRunning ? "Running…" : "Completed"}</span>
              <span>
                {wlStatus!.processed}/{wlStatus!.total}
              </span>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-2 overflow-hidden">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all"
                style={{ width: `${wlPct}%` }}
              />
            </div>
            <div className="flex gap-4 text-xs mt-2">
              <span className="text-green-400">{wlStatus!.succeeded} succeeded</span>
              <span className="text-red-400">{wlStatus!.failed} failed</span>
            </div>
            {wlStatus!.errors.length > 0 && (
              <details className="mt-2 text-xs text-gray-400">
                <summary className="cursor-pointer">{wlStatus!.errors.length} error(s)</summary>
                <ul className="mt-1 space-y-1">
                  {wlStatus!.errors.map((e, i) => (
                    <li key={`${e.bot_id}-${i}`} className="font-mono break-all">
                      <span className="text-gray-300">{e.bot_id}</span>: {e.error}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </Collapsible>

      <ConfirmModal
        isOpen={confirmAction !== null}
        title={confirmCopy.title}
        message={confirmCopy.message}
        confirmText={confirmCopy.confirmText}
        onConfirm={onConfirm}
        onCancel={() => setConfirmAction(null)}
      />
    </div>
  );
}
