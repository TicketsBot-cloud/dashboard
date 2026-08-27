import { useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router";
import { useGuildStore } from "@/stores/guild";
import { useUIStore } from "@/stores/ui";

const INPUT_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  if (INPUT_TAGS.has(target.tagName)) return true;
  if (target.isContentEditable) return true;
  return false;
}

export interface Shortcut {
  keys: string;
  label: string;
  section: string;
  action: () => void;
}

export function useGlobalShortcuts(onShowHelp: () => void) {
  const navigate = useNavigate();
  const selectedGuild = useGuildStore((s) => s.selectedGuild);
  const setCommandPaletteOpen = useUIStore((s) => s.setCommandPaletteOpen);
  const pendingPrefix = useRef<string | null>(null);
  const prefixTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const guildId = selectedGuild?.id;
  const permissionLevel = selectedGuild?.permission_level ?? 0;
  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent);

  const modKey = isMac ? "⌘" : "Ctrl+";

  const getShortcuts = useCallback((): Shortcut[] => {
    const shortcuts: Shortcut[] = [
      {
        keys: "?",
        label: "Show keyboard shortcuts",
        section: "General",
        action: onShowHelp,
      },
      {
        keys: `${modKey}K`,
        label: "Open command palette",
        section: "General",
        action: () => setCommandPaletteOpen(true),
      },
    ];

    if (guildId) {
      shortcuts.push(
        {
          keys: "g o",
          label: "Go to Overview",
          section: "Navigation",
          action: () => navigate(`/manage/${guildId}`),
        },
        {
          keys: "g t",
          label: "Go to Tickets",
          section: "Navigation",
          action: () => navigate(`/manage/${guildId}/tickets`),
        },
        {
          keys: "g a",
          label: "Go to Analytics",
          section: "Navigation",
          action: () => navigate(`/manage/${guildId}/analytics`),
        },
        {
          keys: "g r",
          label: "Go to Transcripts",
          section: "Navigation",
          action: () => navigate(`/manage/${guildId}/transcripts`),
        },
      );

      if (permissionLevel >= 2) {
        shortcuts.push(
          {
            keys: "g p",
            label: "Go to Panels",
            section: "Navigation",
            action: () => navigate(`/manage/${guildId}/panels`),
          },
          {
            keys: "g s",
            label: "Go to Settings",
            section: "Navigation",
            action: () => navigate(`/manage/${guildId}/settings`),
          },
        );
      }
    }

    return shortcuts;
  }, [guildId, modKey, permissionLevel, navigate, onShowHelp, setCommandPaletteOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return;

      const commandPaletteOpen = useUIStore.getState().commandPaletteOpen;
      if (commandPaletteOpen) return;

      if (e.key === "?") {
        e.preventDefault();
        onShowHelp();
        return;
      }

      if (pendingPrefix.current === "g") {
        pendingPrefix.current = null;
        if (prefixTimer.current) clearTimeout(prefixTimer.current);

        if (!guildId) return;

        const keyMap: Record<string, string> = {
          o: `/manage/${guildId}`,
          t: `/manage/${guildId}/tickets`,
          a: `/manage/${guildId}/analytics`,
          r: `/manage/${guildId}/transcripts`,
          ...(permissionLevel >= 2
            ? {
                p: `/manage/${guildId}/panels`,
                s: `/manage/${guildId}/settings`,
              }
            : {}),
        };

        const path = keyMap[e.key];
        if (path) {
          e.preventDefault();
          navigate(path);
        }
        return;
      }

      if (e.key === "g" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        pendingPrefix.current = "g";
        prefixTimer.current = setTimeout(() => {
          pendingPrefix.current = null;
        }, 500);
        return;
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (prefixTimer.current) clearTimeout(prefixTimer.current);
    };
  }, [guildId, permissionLevel, navigate, onShowHelp]);

  return { getShortcuts };
}
