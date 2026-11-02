import { useEffect, useState } from "react";
import { buildEmojiTable } from "./table";
import type { DiscordEmojiTable } from "./table";

export type { DiscordEmojiTable } from "./table";

let table: DiscordEmojiTable | null = null;
let loading: Promise<DiscordEmojiTable> | null = null;

function loadDiscordEmoji(): Promise<DiscordEmojiTable> {
  loading ??= import("@emoji-platform-data/discord")
    .then(({ byEmoji }) => (table = buildEmojiTable(byEmoji)))
    .catch((error: unknown) => {
      loading = null;
      throw error;
    });
  return loading;
}

export function useDiscordEmoji(): DiscordEmojiTable | null {
  const [loaded, setLoaded] = useState(table);

  useEffect(() => {
    if (loaded) return;
    let cancelled = false;
    loadDiscordEmoji()
      .then((result) => {
        if (!cancelled) setLoaded(result);
      })
      .catch(() => {
        // Non-fatal: emoji stay plain text; the next mount retries.
      });
    return () => {
      cancelled = true;
    };
  }, [loaded]);

  return loaded;
}
