import { type FC, useState } from "react";
import { toast } from "sonner";
import DismissibleModal from "@/components/modal-primitives/DismissibleModal";
import Button from "@/components/Button";
import { useErrorModalStore } from "@/stores/errorModal";
import { useAuthStore } from "@/stores/auth";
import { useGuildStore } from "@/stores/guild";

const ErrorDetailModal: FC = () => {
  const { isOpen, details, toastId, close } = useErrorModalStore();
  const [copied, setCopied] = useState(false);

  const handleClose = () => {
    if (toastId !== undefined) {
      toast.dismiss(toastId);
    }
    close();
  };

  const handleCopy = async () => {
    const userId = useAuthStore.getState().user?.id;
    const guildId = useGuildStore.getState().selectedGuild?.id;

    const payload = {
      ...(details?.status !== undefined && { status: details.status }),
      ...(details?.requestMethod && { method: details.requestMethod.toUpperCase() }),
      ...(details?.requestUrl && { url: details.requestUrl }),
      message: details?.message,
      ...(details?.apiError &&
        details.apiError !== details?.message && { apiError: details.apiError }),
      ...(details?.internalError && { internalError: details.internalError }),
      ...(userId && { userId }),
      ...(guildId && { guildId }),
      page: window.location.pathname,
    };
    await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <DismissibleModal isOpen={isOpen} onClose={handleClose} className="max-w-lg" unstyled>
      <div className="p-6 pr-12">
        <div className="flex items-start justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-red-500/15 flex items-center justify-center shrink-0">
              <svg
                className="w-5 h-5 text-red-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                />
              </svg>
            </div>
            <h2 className="text-base font-semibold text-white">Error Details</h2>
          </div>
        </div>

        <div className="space-y-3">
          {details?.status && (
            <div className="flex items-center gap-3 bg-gray-700/50 rounded-lg px-3 py-2">
              <span className="text-xs text-gray-400 w-24 shrink-0">Status Code</span>
              <span className="text-sm font-mono text-red-300">{details.status}</span>
            </div>
          )}

          {(details?.requestMethod || details?.requestUrl) && (
            <div className="flex items-start gap-3 bg-gray-700/50 rounded-lg px-3 py-2">
              <span className="text-xs text-gray-400 w-24 shrink-0 pt-0.5">Request</span>
              <span className="text-sm font-mono text-gray-300 break-all">
                {details.requestMethod?.toUpperCase()} {details.requestUrl}
              </span>
            </div>
          )}

          <div className="flex items-start gap-3 bg-gray-700/50 rounded-lg px-3 py-2">
            <span className="text-xs text-gray-400 w-24 shrink-0 pt-0.5">Message</span>
            <span className="text-sm text-gray-200 wrap-break-word">{details?.message}</span>
          </div>

          {details?.apiError && details.apiError !== details.message && (
            <div className="flex items-start gap-3 bg-gray-700/50 rounded-lg px-3 py-2">
              <span className="text-xs text-gray-400 w-24 shrink-0 pt-0.5">API Error</span>
              <span className="text-sm font-mono text-gray-300 break-all whitespace-pre-wrap">
                {details.apiError}
              </span>
            </div>
          )}

          {details?.internalError &&
            details.internalError !== details.apiError &&
            details.internalError !== details.message && (
              <div className="flex items-start gap-3 bg-gray-700/50 rounded-lg px-3 py-2">
                <span className="text-xs text-gray-400 w-24 shrink-0 pt-0.5">Internal Error</span>
                <span className="text-sm font-mono text-gray-400 break-all whitespace-pre-wrap max-h-32 overflow-y-auto">
                  {details.internalError}
                </span>
              </div>
            )}
        </div>

        <div className="mt-5">
          <Button
            variant="secondary"
            onClick={handleCopy}
            className="rounded-lg text-sm font-medium"
          >
            {copied ? (
              <>
                <svg
                  className="w-4 h-4 text-green-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
                <span className="text-green-400">Copied</span>
              </>
            ) : (
              <>
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184"
                  />
                </svg>
                Copy
              </>
            )}
          </Button>
        </div>
      </div>
    </DismissibleModal>
  );
};

export default ErrorDetailModal;
