import type { RouteObject } from "react-router";

import { requireAdminTier } from "@/router/loaders";
import {
  AdminAffiliatePage,
  AdminAnalyticsPage,
  AdminAuditLogPage,
  AdminFeatureFlagsPage,
  AdminGalleryPage,
  AdminIntegrationsPage,
  AdminPolarProductsPage,
  AdminSkusPage,
  AdminUtilitiesPage,
  BotStaffPage,
  GlobalBlacklistPage,
  PremiumPage,
  ServerBlacklistPage,
} from "@/router/lazy-pages";
import { AdminIndexRedirect, SiblingRouteRedirect } from "@/router/redirects/components";
import { lazyPage } from "@/router/wrap";

/** Child routes under `/admin`. */
export const adminRoutes: RouteObject[] = [
  { index: true, element: <AdminIndexRedirect /> },
  {
    path: "bot-staff",
    loader: requireAdminTier("admin"),
    element: lazyPage(<BotStaffPage />),
  },
  { path: "botstaff", element: <SiblingRouteRedirect to="bot-staff" /> },
  {
    path: "premium",
    loader: requireAdminTier("admin"),
    element: lazyPage(<PremiumPage />),
  },
  { path: "gallery", element: lazyPage(<AdminGalleryPage />) },
  {
    path: "integrations",
    loader: requireAdminTier("admin"),
    element: lazyPage(<AdminIntegrationsPage />),
  },
  {
    path: "global-blacklist",
    loader: requireAdminTier("owner"),
    element: lazyPage(<GlobalBlacklistPage />),
  },
  { path: "server-blacklist", element: lazyPage(<ServerBlacklistPage />) },
  {
    path: "polar-products",
    loader: requireAdminTier("owner"),
    element: lazyPage(<AdminPolarProductsPage />),
  },
  {
    path: "skus",
    loader: requireAdminTier("owner"),
    element: lazyPage(<AdminSkusPage />),
  },
  {
    path: "affiliate",
    loader: requireAdminTier("admin"),
    element: lazyPage(<AdminAffiliatePage />),
  },
  {
    path: "analytics",
    loader: requireAdminTier("admin"),
    element: lazyPage(<AdminAnalyticsPage />),
  },
  {
    path: "flags",
    loader: requireAdminTier("admin"),
    element: lazyPage(<AdminFeatureFlagsPage />),
  },
  {
    path: "audit-log",
    loader: requireAdminTier("admin"),
    element: lazyPage(<AdminAuditLogPage />),
  },
  {
    path: "utilities",
    loader: requireAdminTier("owner"),
    element: lazyPage(<AdminUtilitiesPage />),
  },
];
