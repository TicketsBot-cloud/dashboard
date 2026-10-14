import { useState } from "react";

/**
 * Tracks which fields have been blurred so their errors can wait until the person has left the
 * field. `revealAll` (a save attempt) shows every error regardless.
 */
export function useTouchedFields(revealAll: boolean) {
  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set());

  return {
    shows: (key: string) => revealAll || touched.has(key),
    touch: (key: string) => setTouched((prev) => (prev.has(key) ? prev : new Set(prev).add(key))),
  };
}
