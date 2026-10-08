import type { FC } from "react";

interface ComponentBudgetMeterProps {
  used: number;
  max: number;
  reservedNote?: string;
}

const ComponentBudgetMeter: FC<ComponentBudgetMeterProps> = ({ used, max, reservedNote }) => {
  const ratio = max > 0 ? used / max : 0;
  // red-500 (#ef4444) on the gray-700 (#374151) track only reaches ~2.7:1, below the WCAG
  // 1.4.11 3:1 minimum for non-text UI components; red-400 (#f87171) reaches ~3.7:1.
  const fillClass = used > max ? "bg-red-400" : ratio >= 0.8 ? "bg-amber-500" : "bg-blue-500";
  const widthPercent = Math.min(100, Math.max(0, ratio * 100));

  return (
    <div className="mt-3" aria-live="polite">
      <p className="text-xs text-gray-400">
        {used} of {max} blocks used
      </p>
      <div className="mt-1 bg-gray-700 h-1.5 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${fillClass}`} style={{ width: `${widthPercent}%` }} />
      </div>
      {reservedNote && <p className="mt-1 text-xs text-gray-400">{reservedNote}</p>}
    </div>
  );
};

export default ComponentBudgetMeter;
