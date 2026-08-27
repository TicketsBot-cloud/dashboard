import type { RouteObject } from "react-router";

import { KBArticle, KBCategoryPage, KBHome, KBLayout, KBSearchPage } from "@/router/lazy-pages";
import { lazyPage } from "@/router/wrap";

export const publicKbRoutes: RouteObject[] = [
  {
    path: "/kb/:guildId",
    element: lazyPage(<KBLayout />),
    children: [
      { index: true, element: lazyPage(<KBHome />) },
      { path: "search", element: lazyPage(<KBSearchPage />) },
      { path: "category/:catId", element: lazyPage(<KBCategoryPage />) },
      { path: ":slug", element: lazyPage(<KBArticle />) },
    ],
  },
];
