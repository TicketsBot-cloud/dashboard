import { useState, useCallback, useRef } from "react";

export function useMutationGuard() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inFlight = useRef(false);

  const guard = useCallback(async <T>(fn: () => Promise<T>): Promise<T | undefined> => {
    if (inFlight.current) return undefined;
    inFlight.current = true;
    setIsSubmitting(true);
    try {
      return await fn();
    } finally {
      inFlight.current = false;
      setIsSubmitting(false);
    }
  }, []);

  return { isSubmitting, guard };
}
