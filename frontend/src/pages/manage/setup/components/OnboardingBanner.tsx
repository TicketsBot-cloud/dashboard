import type { FC } from "react";
import { Link } from "react-router";
import { apiClient } from "@/lib/api";
import { useOnboardingStore } from "@/stores/onboarding";
import Button from "@/components/Button";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import { SETUP_ONBOARDING_WIZARD_FLAG } from "@/lib/feature-flags";

interface OnboardingBannerProps {
  guildId: string;
}

const OnboardingBanner: FC<OnboardingBannerProps> = ({ guildId }) => {
  const { state, setState: setOnboardingState } = useOnboardingStore();
  const { enabled: wizardEnabled, isLoading: flagLoading } = useFeatureFlag(
    SETUP_ONBOARDING_WIZARD_FLAG,
    guildId,
  );

  if (!state || state.onboarding_completed || state.skipped || flagLoading || !wizardEnabled) {
    return null;
  }

  const handleDismiss = async () => {
    try {
      await apiClient.onboarding.update(guildId, { skipped: true });
      setOnboardingState({ ...state, skipped: true });
    } catch {
      // Silently fail - the banner will persist until next page load
    }
  };

  return (
    <div className="animate-fade-in-up mx-4 mb-4 mt-6 sm:absolute sm:top-6 sm:left-1/2 sm:-translate-x-1/2 sm:w-full sm:mx-0 sm:mb-0 sm:mt-0 max-w-6xl sm:z-40 rounded-lg border border-blue-500/40 bg-blue-500/10 px-4 py-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <svg
            className="h-5 w-5 shrink-0 text-blue-400"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M5 2a1 1 0 011 1v1h1a1 1 0 010 2H6v1a1 1 0 01-2 0V6H3a1 1 0 010-2h1V3a1 1 0 011-1zm0 10a1 1 0 011 1v1h1a1 1 0 110 2H6v1a1 1 0 11-2 0v-1H3a1 1 0 110-2h1v-1a1 1 0 011-1zM12 2a1 1 0 01.967.744L14.146 7.2 17.5 9.134a1 1 0 010 1.732l-3.354 1.935-1.18 4.455a1 1 0 01-1.933 0L9.854 12.8 6.5 10.866a1 1 0 010-1.732l3.354-1.935 1.18-4.455A1 1 0 0112 2z"
              clipRule="evenodd"
            />
          </svg>
          <p className="text-sm text-blue-300">
            Complete your server setup to get the most out of Tickets.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDismiss}
            className="text-gray-400 hover:text-gray-300"
          >
            Dismiss
          </Button>
          <Link to={`/manage/${guildId}/setup`}>
            <Button variant="primary" size="sm">
              Continue Setup
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default OnboardingBanner;
