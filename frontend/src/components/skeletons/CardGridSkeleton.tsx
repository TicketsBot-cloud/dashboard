import Skeleton from "react-loading-skeleton";

interface CardGridSkeletonProps {
  cards?: number;
  sections?: number;
}

export default function CardGridSkeleton({ cards = 6, sections = 1 }: CardGridSkeletonProps) {
  return (
    <div className="space-y-8">
      {Array.from({ length: sections }).map((_, sectionIdx) => (
        <div key={sectionIdx}>
          <div className="mb-4">
            <Skeleton width={220} height={20} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: cards }).map((_, cardIdx) => (
              <div key={cardIdx} className="bg-gray-800 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <Skeleton circle width={40} height={40} />
                  <div className="flex-1">
                    <Skeleton width="60%" height={16} />
                  </div>
                </div>
                <Skeleton count={2} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
