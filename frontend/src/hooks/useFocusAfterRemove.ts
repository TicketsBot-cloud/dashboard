import { useLayoutEffect, useRef } from "react";

/** Focuses after the commit, once the removed row is gone and the target may have become enabled. */
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
