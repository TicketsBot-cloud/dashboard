import { useCallback } from "react";
import { toast } from "sonner";
import { readApiError, showApiErrorToast } from "@/lib/api-error";

/**
 * A 503 means a FEATURE_* switch flipped mid-session, which useFeatureLock's
 * polled value won't reflect until its next tick, so force the lock here.
 *
 * Pass the useState setter itself: its stable identity keeps the returned
 * handler stable enough to list in other hooks' dependency arrays.
 */
export function useApiErrorHandler(
  unavailableMessage: string,
  setForcedLock: (locked: boolean) => void,
): (error: unknown, fallbackMessage: string) => void {
  return useCallback(
    (error: unknown, fallbackMessage: string) => {
      const { status, message } = readApiError(error);
      if (status === 503) {
        toast.warning(message ?? unavailableMessage);
        setForcedLock(true);
        return;
      }
      showApiErrorToast(error, fallbackMessage);
    },
    [unavailableMessage, setForcedLock],
  );
}
