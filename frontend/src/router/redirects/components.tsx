import { Navigate, useLocation, useParams } from "react-router";

import { isAtLeast } from "@/lib/admin-tier";
import { useAuthStore } from "@/stores/auth";

/** Absolute redirect (safe for top-level legacy paths). */
export function AbsoluteRedirect({ to }: { to: string }) {
  return <Navigate to={to} replace />;
}

/**
 * Index route → named child (e.g. /admin → /admin/bot-staff, /premium → /premium/pricing).
 * Do not prefix with `../` — that would escape the parent layout.
 */
export function IndexRouteRedirect({ to }: { to: string }) {
  return <Navigate to={to} replace relative="route" />;
}

/**
 * Legacy leaf route → canonical sibling under the same parent (e.g. staffoverride → staff-override).
 * Uses `../` + route-relative navigation so the URL is replaced, not appended to.
 */
export function SiblingRouteRedirect({ to }: { to: string }) {
  const target = to.startsWith("../") ? to : `../${to}`;
  return <Navigate to={target} replace relative="route" />;
}

export function LegacyEditMultiPanelRedirect() {
  const { panelId } = useParams();
  return <Navigate to={`../multi/edit/${panelId}`} replace relative="route" />;
}

export function LegacyCallbackRedirect() {
  const location = useLocation();
  return <Navigate to={{ pathname: "/oauth2/callback", search: location.search }} replace />;
}

export function AdminIndexRedirect() {
  const user = useAuthStore((state) => state.user);
  const target = user && isAtLeast(user.admin_tier, "admin") ? "bot-staff" : "gallery";
  return <IndexRouteRedirect to={target} />;
}
