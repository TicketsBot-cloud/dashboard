import Skeleton from "react-loading-skeleton";

interface TableSkeletonProps {
  rows?: number;
  columns?: number;
  showHeader?: boolean;
}

export default function TableSkeleton({
  rows = 6,
  columns = 4,
  showHeader = true,
}: TableSkeletonProps) {
  return (
    <div
      className="bg-gray-800 rounded-xl p-6"
      role="status"
      aria-live="polite"
      aria-label="Loading"
    >
      {showHeader && (
        <div className="mb-4" aria-hidden="true">
          <Skeleton width={180} height={24} />
        </div>
      )}
      <div className="overflow-x-auto" aria-hidden="true">
        <table className="w-full text-sm text-left">
          <thead className="text-xs uppercase bg-gray-700 text-gray-400">
            <tr>
              {Array.from({ length: columns }).map((_, i) => (
                <th key={i} className="px-6 py-3">
                  <Skeleton width={80} height={12} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }).map((_, rowIdx) => (
              <tr key={rowIdx} className="border-b bg-gray-800 border-gray-700">
                {Array.from({ length: columns }).map((_, colIdx) => (
                  <td key={colIdx} className="px-6 py-4">
                    <Skeleton width={colIdx === 0 ? 40 : undefined} containerClassName="flex-1" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
