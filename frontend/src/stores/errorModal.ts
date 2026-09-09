import { create } from "zustand";

export interface ErrorDetails {
  status?: number;
  message: string;
  apiError?: string;
  internalError?: string;
  requestUrl?: string;
  requestMethod?: string;
}

interface ErrorModalStore {
  isOpen: boolean;
  details: ErrorDetails | null;
  toastId: string | number | undefined;
  open: (details: ErrorDetails, toastId?: string | number) => void;
  close: () => void;
}

export const useErrorModalStore = create<ErrorModalStore>((set) => ({
  isOpen: false,
  details: null,
  toastId: undefined,
  open: (details, toastId) => set({ isOpen: true, details, toastId }),
  close: () => set({ isOpen: false }),
}));
