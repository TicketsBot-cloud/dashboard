import { useLayoutEffect, useRef } from "react";

/**
 * Moves focus to a fixed control once the render that follows a row removal has committed. The
 * removed row's button is gone by then, and the target may only just have become enabled.
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
