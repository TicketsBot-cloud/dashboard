import type { RouteObject } from "react-router";

import { NotFound } from "@/router/lazy-pages";
import { lazyPage } from "@/router/wrap";

export const errorRoutes: RouteObject[] = [
  {
    path: "/error",
    element: lazyPage(<NotFound />),
  },
  {
    path: "/404",
    element: lazyPage(<NotFound />),
  },
];
