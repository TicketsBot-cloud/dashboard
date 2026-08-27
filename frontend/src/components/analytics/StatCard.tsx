import type { FC } from "react";
import Skeleton from "react-loading-skeleton";

interface StatCardProps {
  label: string;
  value: string | number;
  subtitle?: string;
}

const StatCard: FC<StatCardProps> = ({ label, value, subtitle }) => {
  return (
    <div className="bg-gray-800 rounded-xl p-5">
      <dt className="text-gray-300 text-sm mb-1">{label}</dt>
      <dd className="text-2xl font-bold text-white">
        {value}
        {subtitle && (
          <span className="text-gray-400 text-xs mt-1 block font-normal">{subtitle}</span>
        )}
      </dd>
    </div>
  );
};

const StatCardSkeleton: FC = () => (
  <div className="bg-gray-800 rounded-xl p-5" aria-hidden="true">
    <Skeleton width={100} height={14} baseColor="#374151" highlightColor="#4B5563" />
    <Skeleton
      width={80}
      height={28}
      className="mt-1"
      baseColor="#374151"
      highlightColor="#4B5563"
    />
  </div>
);

export { StatCard, StatCardSkeleton };
export default StatCard;
