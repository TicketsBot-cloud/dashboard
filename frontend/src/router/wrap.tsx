import { Suspense, type ReactNode } from "react";

import RequirePermission from "@/components/RequirePermission";

const RouteLoader = () => <div className="min-h-50" />;

export function lazyPage(element: ReactNode) {
  return <Suspense fallback={<RouteLoader />}>{element}</Suspense>;
}

export function guildPage(level: 1 | 2, element: ReactNode) {
  return lazyPage(<RequirePermission level={level}>{element}</RequirePermission>);
}
