import type { FC } from "react";
import { MAX_TEXT_CHARACTERS } from "@/lib/component-tree";

interface ComponentBudgetMeterProps {
  used: number;
  max: number;
  reservedNote?: string;
  textUsed: number;
}

const ComponentBudgetMeter: FC<ComponentBudgetMeterProps> = ({
  used,
  max,
  reservedNote,
  textUsed,
}) => {
  const ratio = max > 0 ? used / max : 0;
  const fillClass = used > max ? "bg-red-400" : ratio >= 0.8 ? "bg-amber-500" : "bg-blue-500";
  const widthPercent = Math.min(100, Math.max(0, ratio * 100));

  return (
    <div className="mt-3">
      <p role="status" className="text-xs text-gray-400">
        {used} of {max} components used
      </p>
      <div className="mt-1 bg-gray-700 h-1.5 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${fillClass}`} style={{ width: `${widthPercent}%` }} />
      </div>
      {reservedNote && <p className="mt-1 text-xs text-gray-400">{reservedNote}</p>}
      {/* Outside the status line, which would otherwise speak on every keystroke. */}
      <p
        className={`mt-1 text-xs ${textUsed > MAX_TEXT_CHARACTERS ? "text-red-400" : "text-gray-400"}`}
      >
        {textUsed} of {MAX_TEXT_CHARACTERS} text characters used
      </p>
    </div>
  );
};

export default ComponentBudgetMeter;
