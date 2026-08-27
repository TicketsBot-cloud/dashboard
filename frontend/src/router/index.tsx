import { createBrowserRouter, RouterProvider } from "react-router";

import { topLevelRedirectRoutes } from "@/router/redirects/top-level";
import { appRoutes } from "@/router/routes/app";
import { errorRoutes } from "@/router/routes/errors";
import { manageSetupRoutes } from "@/router/routes/manage-setup";
import { publicKbRoutes } from "@/router/routes/public-kb";
import { standaloneRoutes } from "@/router/routes/standalone";

export const router = createBrowserRouter([
  ...topLevelRedirectRoutes,
  ...errorRoutes,
  ...standaloneRoutes,
  ...publicKbRoutes,
  ...manageSetupRoutes,
  appRoutes,
]);

export default function Router() {
  return <RouterProvider router={router} />;
}
