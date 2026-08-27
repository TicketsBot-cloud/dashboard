import Skeleton from "react-loading-skeleton";

export default function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="bg-gray-800 rounded-xl p-6">
        <div className="flex items-center gap-4 mb-6">
          <Skeleton circle width={48} height={48} />
          <div className="flex-1">
            <Skeleton width={240} height={22} />
            <Skeleton width={160} height={14} className="mt-2" />
          </div>
        </div>
        <Skeleton count={4} className="mb-2" />
      </div>
      <div className="bg-gray-800 rounded-xl p-6">
        <Skeleton width={140} height={18} className="mb-4" />
        <Skeleton count={6} className="mb-2" />
      </div>
    </div>
  );
}
