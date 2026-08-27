import type { RouteObject } from "react-router";

import { AbsoluteRedirect, LegacyCallbackRedirect } from "@/router/redirects/components";

/** Standalone redirects and legacy paths outside the main App shell. */
export const topLevelRedirectRoutes: RouteObject[] = [
  {
    path: "/callback",
    element: <LegacyCallbackRedirect />,
  },
  {
    path: "/admin/botstaff",
    element: <AbsoluteRedirect to="/admin/bot-staff" />,
  },
];
