import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface PagePrefs {
  columns: string[];
}

export type ServerListView = "cards" | "icons";

interface ServersPrefs {
  view: ServerListView;
}

interface LayoutPrefs {
  sidebarCollapsed: boolean;
}

interface StoredSort {
  key: string;
  dir: "asc" | "desc";
}

interface PreferencesState {
  tickets: PagePrefs;
  transcripts: PagePrefs;
  auditLog: PagePrefs;
  adminAuditLog: PagePrefs;
  kb: PagePrefs;
  analytics: PagePrefs;
  servers: ServersPrefs;
  layout: LayoutPrefs;
  tableSort: Record<string, StoredSort>;
  setTableSort: (id: string, sort: StoredSort) => void;
  setTicketPrefs: (prefs: Partial<PagePrefs>) => void;
  setTranscriptPrefs: (prefs: Partial<PagePrefs>) => void;
  setAuditLogPrefs: (prefs: Partial<PagePrefs>) => void;
  setAdminAuditLogPrefs: (prefs: Partial<PagePrefs>) => void;
  setKBPrefs: (prefs: Partial<PagePrefs>) => void;
  setAnalyticsPrefs: (prefs: Partial<PagePrefs>) => void;
  setServersPrefs: (prefs: Partial<ServersPrefs>) => void;
  setLayoutPrefs: (prefs: Partial<LayoutPrefs>) => void;
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      tickets: { columns: [] },
      transcripts: { columns: [] },
      auditLog: { columns: [] },
      adminAuditLog: { columns: [] },
      kb: { columns: [] },
      analytics: { columns: [] },
      servers: { view: "cards" },
      layout: { sidebarCollapsed: true },
      tableSort: {},
      setTableSort: (id, sort) =>
        set((state) => ({ tableSort: { ...state.tableSort, [id]: sort } })),
      setTicketPrefs: (prefs) => set((state) => ({ tickets: { ...state.tickets, ...prefs } })),
      setTranscriptPrefs: (prefs) =>
        set((state) => ({ transcripts: { ...state.transcripts, ...prefs } })),
      setAuditLogPrefs: (prefs) => set((state) => ({ auditLog: { ...state.auditLog, ...prefs } })),
      setAdminAuditLogPrefs: (prefs) =>
        set((state) => ({ adminAuditLog: { ...state.adminAuditLog, ...prefs } })),
      setKBPrefs: (prefs) => set((state) => ({ kb: { ...state.kb, ...prefs } })),
      setAnalyticsPrefs: (prefs) =>
        set((state) => ({ analytics: { ...state.analytics, ...prefs } })),
      setServersPrefs: (prefs) => set((state) => ({ servers: { ...state.servers, ...prefs } })),
      setLayoutPrefs: (prefs) => set((state) => ({ layout: { ...state.layout, ...prefs } })),
    }),
    {
      name: "ui-prefs",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
