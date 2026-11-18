import { useState } from "react";

export function useTouchedFields(revealAll: boolean) {
  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set());

  return {
    shows: (key: string) => revealAll || touched.has(key),
    touch: (key: string) => setTouched((prev) => (prev.has(key) ? prev : new Set(prev).add(key))),
  };
}
