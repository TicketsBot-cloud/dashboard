import { useLayoutEffect, useRef } from "react";

/**
 * Waits for the commit: the removed row's button is gone by then, and the target may only just have
 * become enabled.
 */
export function useFocusAfterRemove<T extends HTMLElement>() {
  const targetRef = useRef<T>(null);
  const requested = useRef(false);

  useLayoutEffect(() => {
    if (!requested.current) return;
    requested.current = false;
    targetRef.current?.focus();
  });

  return {
    targetRef,
    request: () => {
      requested.current = true;
    },
  };
}
