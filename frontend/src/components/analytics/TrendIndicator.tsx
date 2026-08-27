import type { FC } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowUp, faArrowDown, faMinus } from "@fortawesome/free-solid-svg-icons";

type TrendPolarity = "lower-is-better" | "higher-is-better";

interface TrendIndicatorProps {
  /** Percentage change for durations, absolute delta for ratings. */
  value: number | null;
  /** How to interpret the direction. Durations are "lower-is-better". */
  polarity: TrendPolarity;
  /** The metric name used in screen-reader labels. */
  metricLabel: string;
  /** Whether this is an absolute delta (rating) rather than a percentage. */
  absolute?: boolean;
  /** Suppress the chip if either period had fewer tickets than this. */
  suppressed?: boolean;
  /** Show a "New" pill when there is current data but no previous period. */
  isNew?: boolean;
}

const CLAMP = 999;

function formatPct(pct: number): string {
  const abs = Math.abs(pct);
  if (abs > CLAMP) return `>${pct > 0 ? "+" : "-"}${CLAMP}%`;
  const sign = pct > 0 ? "+" : pct < 0 ? "-" : "";
  return `${sign}${Math.round(abs)}%`;
}

function formatAbsolute(val: number): string {
  const sign = val > 0 ? "+" : val < 0 ? "-" : "";
  return `${sign}${Math.abs(val).toFixed(1)}`;
}

function ariaLabel(
  metricLabel: string,
  value: number,
  polarity: TrendPolarity,
  absolute: boolean,
): string {
  // Match the chip's neutral threshold: exactly 0, or under 1% for percentages
  const isNeutral = value === 0 || (!absolute && Math.abs(value) < 1);
  if (isNeutral) return `${metricLabel}, no change from the previous period`;

  const magnitude = absolute
    ? Math.abs(value).toFixed(1)
    : `${Math.min(Math.abs(Math.round(value)), CLAMP)} per cent`;

  const isImprovement =
    (polarity === "lower-is-better" && value < 0) || (polarity === "higher-is-better" && value > 0);

  const direction = isImprovement ? "better" : "worse";
  return `${metricLabel}, ${magnitude} ${direction} than the previous period`;
}

const TrendIndicator: FC<TrendIndicatorProps> = ({
  value,
  polarity,
  metricLabel,
  absolute = false,
  suppressed = false,
  isNew = false,
}) => {
  if (isNew) {
    return (
      <span
        title="No data in the previous period"
        className="rounded bg-blue-500/10 px-1.5 py-0.5 text-xs font-medium text-blue-300"
      >
        New
      </span>
    );
  }

  if (suppressed) {
    return (
      <>
        <span
          title="Too few tickets to compare"
          className="text-xs text-gray-400"
          aria-hidden="true"
        >
          -
        </span>
        <span className="sr-only">Not enough data to compare</span>
      </>
    );
  }

  if (value === null || value === undefined) return null;

  const text = absolute ? formatAbsolute(value) : formatPct(value);

  // Determine whether this change is an improvement, regression, or neutral
  const isNeutral = value === 0 || (!absolute && Math.abs(value) < 1);
  const isImprovement =
    !isNeutral &&
    ((polarity === "lower-is-better" && value < 0) ||
      (polarity === "higher-is-better" && value > 0));
  const isRegression = !isNeutral && !isImprovement;

  let icon = faMinus;
  let tone = "bg-gray-700 text-gray-300";

  if (isImprovement) {
    icon = polarity === "lower-is-better" ? faArrowDown : faArrowUp;
    tone = "bg-green-500/10 text-green-400";
  } else if (isRegression) {
    icon = polarity === "lower-is-better" ? faArrowUp : faArrowDown;
    tone = "bg-red-500/10 text-red-400";
  }

  const label = ariaLabel(metricLabel, value, polarity, absolute);
  const trueValue = absolute
    ? (value > 0 ? "+" : "") + value.toFixed(1)
    : (value > 0 ? "+" : "") + Math.round(value) + "%";

  return (
    <span
      role="img"
      title={Math.abs(value) > CLAMP && !absolute ? `True value: ${trueValue}` : undefined}
      aria-label={label}
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium tabular-nums ${tone}`}
    >
      <FontAwesomeIcon icon={icon} className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
      {text}
    </span>
  );
};

export default TrendIndicator;
