import { useCallback, useRef, type FC, type KeyboardEvent } from "react";
import Button from "@/components/Button";

interface StepIndicatorProps {
  steps: Array<{ label: string; icon: string }>;
  currentStep: number;
  completedSteps: Set<number>;
  skippedSteps: Set<number>;
  onStepClick: (step: number) => void;
}

type StepState = "completed" | "active" | "skipped" | "upcoming";

function getStepState(
  index: number,
  currentStep: number,
  completedSteps: Set<number>,
  skippedSteps: Set<number>,
): StepState {
  if (completedSteps.has(index)) return "completed";
  if (index === currentStep) return "active";
  if (skippedSteps.has(index)) return "skipped";
  return "upcoming";
}

const circleClasses: Record<StepState, string> = {
  completed: "bg-blue-500 text-white",
  active: "ring-2 ring-blue-500 bg-gray-800 text-blue-400",
  skipped: "bg-gray-700 text-gray-500",
  upcoming: "bg-gray-700 text-gray-500",
};

const labelClasses: Record<StepState, string> = {
  completed: "text-gray-300",
  active: "text-blue-400",
  skipped: "text-gray-400",
  upcoming: "text-gray-400",
};

export const StepIndicator: FC<StepIndicatorProps> = ({
  steps,
  currentStep,
  completedSteps,
  skippedSteps,
  onStepClick,
}) => {
  const stepRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const isClickable = useCallback(
    (index: number): boolean => {
      return completedSteps.has(index) || skippedSteps.has(index);
    },
    [completedSteps, skippedSteps],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
      let nextIndex: number | null = null;

      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        nextIndex = index < steps.length - 1 ? index + 1 : 0;
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        nextIndex = index > 0 ? index - 1 : steps.length - 1;
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (isClickable(index)) {
          onStepClick(index);
        }
      }

      if (nextIndex !== null) {
        stepRefs.current[nextIndex]?.focus();
      }
    },
    [steps.length, isClickable, onStepClick],
  );

  const renderCircleContent = (index: number, state: StepState) => {
    if (state === "completed") {
      return (
        <span aria-hidden="true" className="text-sm font-bold">
          ✓
        </span>
      );
    }
    if (state === "skipped") {
      return (
        <span aria-hidden="true" className="text-sm font-bold">
          -
        </span>
      );
    }
    return <span className="text-sm font-semibold">{index + 1}</span>;
  };

  const renderConnector = (index: number) => {
    if (index >= steps.length - 1) return null;

    const state = getStepState(index, currentStep, completedSteps, skippedSteps);

    let lineClass = "h-0.5 flex-1 ";
    if (state === "completed") {
      lineClass += "bg-blue-500";
    } else if (state === "skipped") {
      lineClass += "bg-gray-600";
    } else {
      lineClass += "bg-gray-700 border-t-2 border-dashed border-gray-600 h-0";
    }

    return (
      <div className="flex flex-1 items-center px-1 sm:px-2" aria-hidden="true">
        <div className={lineClass} />
      </div>
    );
  };

  const getAccessibleLabel = (index: number, state: StepState, label: string): string => {
    const stepNumber = `Step ${index + 1} of ${steps.length}`;
    const stateLabel =
      state === "completed"
        ? "completed"
        : state === "active"
          ? "current"
          : state === "skipped"
            ? "skipped"
            : "upcoming";
    return `${stepNumber}: ${label} (${stateLabel})`;
  };

  return (
    <nav aria-label="Setup progress">
      <ol className="flex items-center">
        {steps.map((step, index) => {
          const state = getStepState(index, currentStep, completedSteps, skippedSteps);
          const clickable = isClickable(index);

          return (
            <li
              key={index}
              className={`flex items-center ${index < steps.length - 1 ? "flex-1" : ""}`}
            >
              <div className="flex flex-col items-center">
                <Button
                  ref={(el) => {
                    stepRefs.current[index] = el;
                  }}
                  type="button"
                  onClick={() => clickable && onStepClick(index)}
                  onKeyDown={(e) => handleKeyDown(e, index)}
                  aria-label={getAccessibleLabel(index, state, step.label)}
                  aria-current={state === "active" ? "step" : undefined}
                  aria-disabled={!clickable}
                  tabIndex={state === "active" ? 0 : -1}
                  className={`relative flex items-center justify-center rounded-full transition-all duration-200 w-8 h-8 sm:w-10 sm:h-10 ${circleClasses[state]} ${
                    clickable
                      ? "cursor-pointer hover:ring-2 hover:ring-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 focus:ring-offset-gray-900"
                      : "cursor-default"
                  }`}
                >
                  {renderCircleContent(index, state)}

                  {state === "active" && (
                    <span
                      className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-blue-500 animate-pulse"
                      aria-hidden="true"
                    />
                  )}
                </Button>

                <span
                  className={`mt-2 text-xs text-center max-w-16 sm:max-w-20 leading-tight hidden sm:block ${labelClasses[state]}`}
                  aria-hidden="true"
                >
                  {step.label}
                </span>
              </div>

              {renderConnector(index)}
            </li>
          );
        })}
      </ol>
    </nav>
  );
};
