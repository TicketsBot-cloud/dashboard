import type { RouteObject } from "react-router";
import { Navigate } from "react-router";

import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import { PRICING_FLAG } from "@/lib/feature-flags";
import { PremiumLayout, PricingPage, SubscriptionPage } from "@/router/lazy-pages";
import { AbsoluteRedirect, IndexRouteRedirect } from "@/router/redirects/components";
import { lazyPage } from "@/router/wrap";

/**
 * While flags load, render nothing rather than redirecting. Redirecting on an
 * undefined flag would bounce a permitted user to Subscription and back once the
 * value arrived.
 */
function FlaggedPricingRoute() {
  const { enabled, isLoading } = useFeatureFlag(PRICING_FLAG);

  if (isLoading) return null;
  if (!enabled) return <Navigate to="/premium/subscription" replace />;

  return lazyPage(<PricingPage />);
}

/**
 * The section index normally lands on Pricing. With the flag off that page is not
 * reachable, so the index has to go elsewhere: redirecting to /premium would loop
 * straight back through here.
 */
function PremiumIndexRoute() {
  const { enabled, isLoading } = useFeatureFlag(PRICING_FLAG);

  if (isLoading) return null;
  if (!enabled) return <Navigate to="/premium/subscription" replace />;

  return <IndexRouteRedirect to="pricing" />;
}

export const premiumRoutes: RouteObject = {
  path: "premium",
  element: lazyPage(<PremiumLayout />),
  children: [
    { index: true, element: <PremiumIndexRoute /> },
    { path: "pricing", element: <FlaggedPricingRoute /> },
    { path: "subscription", element: lazyPage(<SubscriptionPage />) },
    { path: "select-servers", element: <AbsoluteRedirect to="/premium/subscription" /> },
  ],
};
