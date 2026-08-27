import { create } from "zustand";
import { devtools } from "zustand/middleware";

interface UIState {
  mobileMenuOpen: boolean;

  // Modal state
  modals: Record<string, boolean>;

  // Loading states
  globalLoading: boolean;
  pageLoading: boolean;

  // Command palette
  commandPaletteOpen: boolean;

  // Actions
  toggleMobileMenu: () => void;
  setMobileMenuOpen: (open: boolean) => void;
  openModal: (modalId: string) => void;
  closeModal: (modalId: string) => void;
  closeAllModals: () => void;
  setGlobalLoading: (loading: boolean) => void;
  setPageLoading: (loading: boolean) => void;
  setCommandPaletteOpen: (open: boolean) => void;
}

export const useUIStore = create<UIState>()(
  devtools(
    (set) => ({
      mobileMenuOpen: false,
      modals: {},
      globalLoading: false,
      pageLoading: false,
      commandPaletteOpen: false,

      toggleMobileMenu: () => {
        set((state) => ({ mobileMenuOpen: !state.mobileMenuOpen }), false, "ui/toggleMobileMenu");
      },

      setMobileMenuOpen: (open: boolean) => {
        set({ mobileMenuOpen: open }, false, "ui/setMobileMenuOpen");
      },

      // Modal actions
      openModal: (modalId: string) => {
        set(
          (state) => ({
            modals: { ...state.modals, [modalId]: true },
          }),
          false,
          "ui/openModal",
        );
      },

      closeModal: (modalId: string) => {
        set(
          (state) => ({
            modals: { ...state.modals, [modalId]: false },
          }),
          false,
          "ui/closeModal",
        );
      },

      closeAllModals: () => {
        set({ modals: {} }, false, "ui/closeAllModals");
      },

      // Loading actions
      setGlobalLoading: (loading: boolean) => {
        set({ globalLoading: loading }, false, "ui/setGlobalLoading");
      },

      setPageLoading: (loading: boolean) => {
        set({ pageLoading: loading }, false, "ui/setPageLoading");
      },

      setCommandPaletteOpen: (open: boolean) => {
        set({ commandPaletteOpen: open }, false, "ui/setCommandPaletteOpen");
      },
    }),
    {
      name: "ui-store",
    },
  ),
);
