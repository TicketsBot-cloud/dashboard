import type { RouteObject } from "react-router";

import App from "@/App";
import { AbsoluteRedirect } from "@/router/redirects/components";
import { requireEntitlement } from "@/router/loaders";
import {
  AdminLayout,
  AffiliatePage,
  Callback,
  GalleryBrowsePage,
  GalleryViewPage,
  GuildLayout,
  LogoutPage,
  NotFound,
  NotificationsPage,
  Servers,
  UserSettingsPage,
  WhitelabelPage,
} from "@/router/lazy-pages";
import { adminRoutes } from "@/router/routes/admin";
import { guildRoutes } from "@/router/routes/guild";
import { premiumRoutes } from "@/router/routes/premium";
import { lazyPage } from "@/router/wrap";

/** Routes rendered inside the main App layout (`/`). */
export const appRoutes: RouteObject = {
  path: "/",
  element: <App />,
  children: [
    { index: true, element: lazyPage(<Servers />) },
    { path: "/oauth2/callback", element: lazyPage(<Callback />) },
    {
      path: "/manage/:guildId",
      element: lazyPage(<GuildLayout />),
      children: guildRoutes,
    },
    premiumRoutes,
    { path: "login", element: <AbsoluteRedirect to="/" /> },
    { path: "logout", element: lazyPage(<LogoutPage />) },
    {
      path: "whitelabel",
      loader: requireEntitlement("whitelabel"),
      errorElement: lazyPage(<NotFound />),
      element: lazyPage(<WhitelabelPage />),
    },
    { path: "affiliate", element: lazyPage(<AffiliatePage />) },
    { path: "notifications", element: lazyPage(<NotificationsPage />) },
    { path: "settings", element: lazyPage(<UserSettingsPage />) },
    { path: "gallery", element: lazyPage(<GalleryBrowsePage />) },
    { path: "gallery/:listingId", element: lazyPage(<GalleryViewPage />) },
    {
      path: "admin",
      element: lazyPage(<AdminLayout />),
      errorElement: lazyPage(<NotFound />),
      children: adminRoutes,
    },
    { path: "/*", element: lazyPage(<NotFound />) },
  ],
};
