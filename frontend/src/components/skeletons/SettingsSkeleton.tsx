import Skeleton from "react-loading-skeleton";

export default function SettingsSkeleton() {
  return (
    <div className="space-y-6">
      {Array.from({ length: 3 }).map((_, sectionIdx) => (
        <div key={sectionIdx} className="bg-gray-800 rounded-xl p-6">
          <div className="mb-4">
            <Skeleton width={200} height={20} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: sectionIdx === 0 ? 6 : 4 }).map((_, fieldIdx) => (
              <div key={fieldIdx} className="space-y-2">
                <Skeleton width={120} height={14} />
                <Skeleton height={38} containerClassName="flex-1" />
              </div>
            ))}
          </div>
        </div>
      ))}
      <div className="flex justify-end">
        <Skeleton width={120} height={40} borderRadius={8} />
      </div>
    </div>
  );
}
