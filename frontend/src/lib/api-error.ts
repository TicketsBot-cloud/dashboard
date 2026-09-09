import type { AxiosError } from "axios";
import { toast } from "sonner";
import { useErrorModalStore, type ErrorDetails } from "@/stores/errorModal";

export interface ApiErrorInfo {
  status?: number;
  message?: string;
  internalError?: string;
}

export function readApiError(error: unknown): ApiErrorInfo {
  const response = (error as AxiosError | undefined)?.response;
  const data = response?.data as { error?: string; internal_error?: string } | undefined;
  return {
    status: response?.status,
    // Empty strings collapse to undefined so a fallback still wins.
    message: data?.error || undefined,
    internalError: data?.internal_error || undefined,
  };
}

const STATUS_MESSAGES: Record<number, string> = {
  402: "This feature requires a premium subscription.",
  403: "You don't have permission to perform this action.",
  404: "The requested resource was not found.",
  429: "Too many requests. Please wait a moment and try again.",
  500: "Server error. Please try again later.",
  503: "Service unavailable. Please try again later.",
};

/**
 * `fallback` replaces only the per-status default. Transport failures and 401
 * outrank it: 401 triggers a logout, so a caller's copy would contradict the
 * redirect that follows.
 */
export function resolveErrorMessage(error: unknown, fallback?: string): string {
  const axiosError = error as AxiosError | undefined;

  if (axiosError?.code === "ECONNABORTED") return "Request timed out. Please try again.";

  const response = axiosError?.response;
  if (!response) {
    if (axiosError?.request) return "Network error. Please check your connection.";
    return fallback ?? "An unexpected error occurred";
  }

  const { status } = response;
  if (status === 401) return "Authentication failed. Please log in again.";

  const { message: apiError } = readApiError(error);
  return apiError ?? fallback ?? STATUS_MESSAGES[status] ?? `Request failed with status ${status}`;
}

// A counter, not Date.now(): two failures in the same millisecond would share an
// id, and the Details action would then pin the wrong toast open.
let toastSeq = 0;

/** The error toast plus the "Details" action that opens ErrorDetailModal. */
export function showApiErrorToast(error: unknown, fallback?: string): void {
  const { status, message: apiError, internalError } = readApiError(error);
  const errorMessage = resolveErrorMessage(error, fallback);
  const config = (error as AxiosError | undefined)?.config;

  const toastId = `error-${++toastSeq}`;
  const details: ErrorDetails = {
    status,
    message: errorMessage,
    apiError,
    internalError,
    requestUrl: config?.url,
    requestMethod: config?.method,
  };

  toast.error(errorMessage, {
    id: toastId,
    action: {
      label: "Details",
      onClick: (event) => {
        event.preventDefault();
        toast.error(errorMessage, { id: toastId, duration: Infinity });
        useErrorModalStore.getState().open(details, toastId);
      },
    },
  });
}
