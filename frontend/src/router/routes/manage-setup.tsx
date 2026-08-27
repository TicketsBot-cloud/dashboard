import type { RouteObject } from "react-router";

import { SetupLayout } from "@/router/lazy-pages";
import { lazyPage } from "@/router/wrap";

export const manageSetupRoutes: RouteObject[] = [
  {
    path: "/manage/:guildId/setup",
    element: lazyPage(<SetupLayout />),
  },
];
