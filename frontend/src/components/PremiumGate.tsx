import { Link } from "react-router";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faLock } from "@fortawesome/free-solid-svg-icons";

interface PremiumGateProps {
  isPremium: boolean;
  feature: string;
  description: string;
  requiredTier?: "premium" | "whitelabel";
  variant?: "overlay" | "inline";
  children: React.ReactNode;
}

export default function PremiumGate({
  isPremium,
  description,
  variant = "overlay",
  children,
}: PremiumGateProps) {
  if (isPremium) {
    return <>{children}</>;
  }

  if (variant === "inline") {
    return (
      <div className="bg-gray-800 border border-gray-600 rounded-lg p-5">
        <div className="flex items-center gap-3 mb-1.5">
          <FontAwesomeIcon icon={faLock} className="text-gray-400" aria-hidden="true" />
          <p className="text-white font-medium text-sm">Premium feature</p>
        </div>
        <p className="text-gray-400 text-sm mb-4">{description}</p>
        <Link
          to="/premium/pricing"
          className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded transition-colors"
        >
          View Premium Plans
        </Link>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="absolute inset-0 bg-gray-800/80 backdrop-blur-sm rounded-lg flex flex-col items-center justify-center z-10 p-6">
        <FontAwesomeIcon icon={faLock} className="text-gray-400 text-2xl mb-3" aria-hidden="true" />
        <p className="text-white font-medium mb-3 text-center">{description}</p>
        <Link
          to="/premium/pricing"
          className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded transition-colors"
        >
          View Premium Plans
        </Link>
      </div>
      <div className="opacity-30 pointer-events-none" aria-hidden="true">
        {children}
      </div>
    </div>
  );
}
