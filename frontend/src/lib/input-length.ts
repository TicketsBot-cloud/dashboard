// maxLength counts UTF-16 units, so leave room for an emoji in every free slot and let clampCodePoints trim the rest.
export function codePointMaxLength(max: number, value: string): number {
  return value.length + 2 * Math.max(0, max - [...value].length);
}

// Like the browser's maxLength, only the inserted text is cut.
export function clampCodePoints(prev: string, next: string, max: number): string {
  const n = [...next];
  if (n.length <= max) {
    return next;
  }

  const p = [...prev];
  let start = 0;
  while (start < p.length && start < n.length && p[start] === n[start]) {
    start++;
  }

  let end = 0;
  while (
    end < p.length - start &&
    end < n.length - start &&
    p[p.length - 1 - end] === n[n.length - 1 - end]
  ) {
    end++;
  }

  const inserted = n.slice(start, n.length - end).slice(0, Math.max(0, max - start - end));
  return [...n.slice(0, start), ...inserted, ...n.slice(n.length - end)].join("");
}
