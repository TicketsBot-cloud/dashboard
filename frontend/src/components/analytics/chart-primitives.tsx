import type { FC } from "react";
import { formatDuration } from "@/lib/analytics-format";

export function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr);
  const day = d.getUTCDate().toString().padStart(2, "0");
  const month = d.toLocaleString("en-GB", { month: "short", timeZone: "UTC" });
  return `${day} ${month}`;
}

export function TruncatedYAxisTick(props: {
  x?: number;
  y?: number;
  payload?: { value?: string };
}) {
  const maxLen = 18;
  const full = props.payload?.value ?? "";
  const label = full.length > maxLen ? full.slice(0, maxLen) + "..." : full;

  return (
    <g transform={`translate(${props.x ?? 0},${props.y ?? 0})`}>
      <title>{full}</title>
      <text x={0} y={0} dy={4} textAnchor="end" fill="#D1D5DB" fontSize={12}>
        {label}
      </text>
    </g>
  );
}

interface TooltipPayloadItem {
  value?: number;
  payload?: { date?: string };
}

export const ChartTooltip: FC<{
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
}> = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div
      role="tooltip"
      className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 shadow-lg"
    >
      <p className="text-gray-300 text-xs mb-1">{label ? formatDateLabel(String(label)) : ""}</p>
      <p className="text-white text-sm font-semibold">
        {payload[0].value} ticket{payload[0].value === 1 ? "" : "s"}
      </p>
    </div>
  );
};

export const DurationTooltip: FC<{
  active?: boolean;
  payload?: { value?: number }[];
  label?: string;
}> = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div
      role="tooltip"
      className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 shadow-lg"
    >
      <p className="text-gray-300 text-xs mb-1">{label}</p>
      <p className="text-white text-sm font-semibold">{formatDuration(payload[0].value ?? 0)}</p>
    </div>
  );
};

export const BarTooltip: FC<{
  active?: boolean;
  payload?: { value?: number }[];
  label?: string;
}> = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div
      role="tooltip"
      className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 shadow-lg"
    >
      <p className="text-gray-300 text-xs mb-1">{label}</p>
      <p className="text-white text-sm font-semibold">
        {payload[0].value?.toLocaleString("en-GB")}
      </p>
    </div>
  );
};
