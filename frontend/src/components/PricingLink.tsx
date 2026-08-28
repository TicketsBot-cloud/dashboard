import type { ReactNode } from "react";
import { Link } from "react-router";

import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import { WEBSITE_URL } from "@/lib/constants";
import { PRICING_FLAG } from "@/lib/feature-flags";

interface Props {
  className?: string;
  children: ReactNode;
}

/** With the pricing flag off, /premium/pricing redirects away, so send users to the site instead. */
export default function PricingLink({ className, children }: Props) {
  const { enabled, isLoading } = useFeatureFlag(PRICING_FLAG);

  // Nothing while flags load, so a click never lands on the wrong target.
  if (isLoading) return null;

  if (enabled) {
    return (
      <Link to="/premium/pricing" className={className}>
        {children}
      </Link>
    );
  }

  return (
    <a
      href={`${WEBSITE_URL}/premium`}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
    >
      {children}
    </a>
  );
}
