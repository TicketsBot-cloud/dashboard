import type { OnboardingState } from "@/types";
import { create } from "zustand";
import { devtools } from "zustand/middleware";

interface OnboardingStore {
  state: OnboardingState | null;
  isLoading: boolean;
  localStep: number;

  setState: (state: OnboardingState | null) => void;
  setLoading: (loading: boolean) => void;
  setLocalStep: (step: number) => void;
  reset: () => void;
}

export const useOnboardingStore = create<OnboardingStore>()(
  devtools(
    (set) => ({
      state: null,
      isLoading: false,
      localStep: 0,

      setState: (state: OnboardingState | null) => {
        set({ state, localStep: state?.current_step ?? 0 }, false, "onboarding/setState");
      },

      setLoading: (loading: boolean) => {
        set({ isLoading: loading }, false, "onboarding/setLoading");
      },

      setLocalStep: (step: number) => {
        set({ localStep: step }, false, "onboarding/setLocalStep");
      },

      reset: () => {
        set({ state: null, isLoading: false, localStep: 0 }, false, "onboarding/reset");
      },
    }),
    { name: "onboarding" },
  ),
);
