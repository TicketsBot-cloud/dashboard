import type { FC, ReactNode } from "react";
import Button from "@/components/Button";

interface StepWrapperProps {
  title: string;
  description: string;
  children: ReactNode;
  onNext: () => void;
  onBack?: () => void;
  onSkip?: () => void;
  nextLabel?: string;
  isNextDisabled?: boolean;
  isNextLoading?: boolean;
}

export const StepWrapper: FC<StepWrapperProps> = ({
  title,
  description,
  children,
  onNext,
  onBack,
  onSkip,
  nextLabel,
  isNextDisabled = false,
  isNextLoading = false,
}) => {
  return (
    <div>
      <h2 className="text-2xl font-bold text-white mb-2">{title}</h2>
      <p className="text-gray-400 mb-8">{description}</p>

      <div className="mb-8">{children}</div>

      <div className="flex items-center justify-between border-t border-gray-700 pt-6">
        <div>
          {onBack && (
            <Button variant="secondary" onClick={onBack}>
              Back
            </Button>
          )}
        </div>
        <div className="flex items-center gap-4">
          {onSkip && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onSkip}
              className="text-gray-400 hover:text-gray-300 focus:underline"
            >
              Skip this step
            </Button>
          )}
          <Button variant="primary" onClick={onNext} disabled={isNextDisabled || isNextLoading}>
            {isNextLoading ? "Saving..." : nextLabel || "Next"}
          </Button>
        </div>
      </div>
    </div>
  );
};
