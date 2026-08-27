import Skeleton from "react-loading-skeleton";

interface IconGridSkeletonProps {
  icons?: number;
}

export default function IconGridSkeleton({ icons = 21 }: IconGridSkeletonProps) {
  return (
    <div
      className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-x-6 gap-y-8 place-items-center"
      aria-hidden="true"
    >
      {Array.from({ length: icons }).map((_, idx) => (
        <Skeleton key={idx} width={64} height={64} borderRadius={12} />
      ))}
    </div>
  );
}
