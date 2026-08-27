import type { FC } from "react";
import Skeleton from "react-loading-skeleton";
import { formatDurationOrDash } from "@/lib/analytics-format";
import type { TripleWindowSeconds } from "@/types";

interface DurationWindowBreakdownProps {
  id: string;
  heading: string;
  data: TripleWindowSeconds | undefined;
  isLoading: boolean;
}

const ROWS: Array<{ label: string; key: keyof TripleWindowSeconds }> = [
  { label: "Weekly", key: "weekly" },
  { label: "Monthly", key: "monthly" },
  { label: "All Time", key: "all_time" },
];

const DurationWindowBreakdown: FC<DurationWindowBreakdownProps> = ({
  id,
  heading,
  data,
  isLoading,
}) => (
  <section aria-labelledby={id} className="bg-gray-800 rounded-xl p-5">
    <h2 id={id} className="text-white font-semibold text-lg mb-4">
      {heading}
    </h2>
    {isLoading ? (
      <div className="space-y-3" aria-hidden="true">
        <Skeleton height={40} baseColor="#374151" highlightColor="#4B5563" />
        <Skeleton height={40} baseColor="#374151" highlightColor="#4B5563" />
        <Skeleton height={40} baseColor="#374151" highlightColor="#4B5563" />
      </div>
    ) : (
      <dl className="space-y-3">
        {ROWS.map(({ label, key }) => (
          <div
            key={key}
            className="flex items-center justify-between bg-gray-700/50 rounded-lg px-4 py-3"
          >
            <dt className="text-gray-300 text-sm">{label}</dt>
            <dd className="text-white font-semibold">
              {formatDurationOrDash(data?.[key] ?? null)}
            </dd>
          </div>
        ))}
      </dl>
    )}
  </section>
);

export default DurationWindowBreakdown;
