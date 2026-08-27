import type { RouteObject } from "react-router";

import { UnsubscribePage } from "@/router/lazy-pages";
import { lazyPage } from "@/router/wrap";

/** Top-level pages outside the App shell (besides redirects and errors). */
export const standaloneRoutes: RouteObject[] = [
  {
    path: "/unsubscribe",
    element: lazyPage(<UnsubscribePage />),
  },
];
