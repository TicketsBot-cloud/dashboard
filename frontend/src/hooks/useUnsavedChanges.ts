import { useEffect, useRef, useCallback } from "react";
import { useBlocker } from "react-router";
import { useUIStore } from "@/stores/ui";

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a !== "object") return false;

  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  const aKeys = Object.keys(aObj);
  const bKeys = Object.keys(bObj);

  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key) => deepEqual(aObj[key], bObj[key]));
}

export function useUnsavedChanges<T>(initial: T | null, current: T | null) {
  const isDirty = initial !== null && current !== null && !deepEqual(initial, current);
  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;

  const bypassRef = useRef(false);

  const modals = useUIStore((s) => s.modals);
  const hasOpenModal = Object.values(modals).some(Boolean);

  const blocker = useBlocker(useCallback(() => isDirtyRef.current && !bypassRef.current, []));

  useEffect(() => {
    if (!isDirty) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (bypassRef.current) return;
      e.preventDefault();
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  const confirmLeave = useCallback(() => {
    if (blocker.state === "blocked") {
      blocker.proceed();
    }
  }, [blocker]);

  const cancelLeave = useCallback(() => {
    if (blocker.state === "blocked") {
      blocker.reset();
    }
  }, [blocker]);

  const allowNavigation = useCallback(() => {
    bypassRef.current = true;
  }, []);

  return {
    isDirty,
    isBlocked: blocker.state === "blocked" && !hasOpenModal,
    confirmLeave,
    cancelLeave,
    allowNavigation,
  };
}
