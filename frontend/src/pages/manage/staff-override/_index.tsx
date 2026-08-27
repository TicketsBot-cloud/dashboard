import { useState, useEffect } from "react";
import { useParams } from "react-router";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { apiClient } from "@/lib/api";
import { toast } from "sonner";
import { useGuildStore } from "@/stores/guild";
import Button from "@/components/Button";
import Select from "@/components/Select";
import ConfirmModal from "@/components/modals/ConfirmModal";
import { MainLayout } from "@/pages/layout/Main";
import DetailSkeleton from "@/components/skeletons/DetailSkeleton";

const TIME_PERIOD_OPTIONS = [
  { key: "1", label: "1 hour" },
  { key: "6", label: "6 hours" },
  { key: "24", label: "1 day" },
  { key: "72", label: "3 days" },
];

export default function StaffOverridePage() {
  const { guildId } = useParams<{ guildId: string }>();
  const { selectedGuild } = useGuildStore();

  const [hasOverride, setHasOverride] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [timePeriod, setTimePeriod] = useState("1");
  const [isGranting, setIsGranting] = useState(false);
  const [showRevokeConfirm, setShowRevokeConfirm] = useState(false);
  const [showGrantConfirm, setShowGrantConfirm] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await apiClient.staffOverride.get(guildId!);
        setHasOverride(res.data.has_override ?? false);
      } catch {
        // handled by interceptor
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [guildId]);

  const handleGrant = async () => {
    setIsGranting(true);
    try {
      await apiClient.staffOverride.create(guildId!, parseInt(timePeriod));
      toast.success("Staff access has been granted.");
      setHasOverride(true);
      setShowGrantConfirm(false);
    } catch {
      // handled by interceptor
    } finally {
      setIsGranting(false);
    }
  };

  const handleRevoke = async () => {
    try {
      await apiClient.staffOverride.delete(guildId!);
      toast.success("Staff access has been revoked.");
      setHasOverride(false);
      setShowRevokeConfirm(false);
    } catch {
      // handled by interceptor
    }
  };

  const selectedPeriodLabel =
    TIME_PERIOD_OPTIONS.find((o) => o.key === timePeriod)?.label ?? timePeriod;

  if (isLoading) {
    return (
      <MainLayout title="Staff Override">
        <DetailSkeleton />
      </MainLayout>
    );
  }

  return (
    <MainLayout
      title={`Staff Override - ${selectedGuild?.name}`}
      subtitle="Grant the Tickets support team temporary access to your server's dashboard."
    >
      <div className="max-w-xl mx-auto">
        {/* Status card */}
        <div
          className={`rounded-xl p-5 mb-5 flex items-center gap-4 ${hasOverride ? "bg-yellow-900/30 border border-yellow-700/50" : "bg-gray-800"}`}
        >
          <div
            className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${hasOverride ? "bg-yellow-600/30 text-yellow-400" : "bg-gray-700 text-gray-400"}`}
          >
            <FontAwesomeIcon icon={hasOverride ? "user-shield" : "shield"} size="lg" />
          </div>
          <div>
            <p className="font-medium">
              {hasOverride ? "Staff access is currently active" : "No active staff access"}
            </p>
            <p className="text-sm text-gray-400 mt-0.5">
              {hasOverride
                ? "The Tickets support team can currently view your dashboard."
                : "The Tickets support team does not have access to your dashboard."}
            </p>
          </div>
        </div>

        {/* Description */}
        <div className="bg-gray-800 rounded-xl p-5 mb-5">
          <h2 className="font-medium mb-2">About Staff Override</h2>
          <p className="text-sm text-gray-400 leading-relaxed">
            You can grant the Tickets support team temporary access to your server's dashboard to
            help you resolve issues. They will only be able to view and adjust your server
            configuration - they cannot perform any destructive actions. You can revoke access at
            any time.
          </p>
        </div>

        {/* Actions */}
        <div className="bg-gray-800 rounded-xl p-5">
          {!hasOverride && (
            <div className="flex flex-col sm:flex-row gap-3 mb-4">
              <div className="flex-1">
                <Select
                  label="Access Duration"
                  value={timePeriod}
                  options={TIME_PERIOD_OPTIONS}
                  onChange={(v) => setTimePeriod(v ?? "1")}
                />
              </div>
            </div>
          )}

          <div className="flex gap-3">
            {hasOverride && (
              <Button
                variant="danger"
                onClick={() => setShowRevokeConfirm(true)}
                className="text-sm font-medium"
              >
                Revoke Access
              </Button>
            )}
            {!hasOverride && (
              <Button
                variant="primary"
                onClick={() => setShowGrantConfirm(true)}
                disabled={isGranting}
                className="text-sm font-medium"
              >
                {isGranting ? "Granting…" : "Grant Access"}
              </Button>
            )}
          </div>
        </div>
      </div>

      <ConfirmModal
        isOpen={showGrantConfirm}
        title="Grant Staff Access"
        message={`Allow the Tickets support team to access this server's dashboard for ${selectedPeriodLabel}?`}
        confirmText="Grant Access"
        confirmVariant="primary"
        onConfirm={handleGrant}
        onCancel={() => setShowGrantConfirm(false)}
      />
      <ConfirmModal
        isOpen={showRevokeConfirm}
        title="Revoke Staff Access"
        message="Remove the Tickets support team's access to this server's dashboard?"
        confirmText="Revoke"
        confirmVariant="danger"
        onConfirm={handleRevoke}
        onCancel={() => setShowRevokeConfirm(false)}
      />
    </MainLayout>
  );
}
