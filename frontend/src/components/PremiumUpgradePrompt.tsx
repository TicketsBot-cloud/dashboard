import { Link } from "react-router";

interface Props {
  message?: string;
  feature?: string;
}

export default function PremiumUpgradePrompt({ message, feature }: Props) {
  const defaultMsg = feature
    ? `Upgrade to premium to unlock ${feature}.`
    : "This feature requires a premium subscription.";

  return (
    <div className="bg-amber-900/30 border border-amber-600/50 rounded-lg p-4 flex items-center justify-between">
      <p className="text-amber-200">{message || defaultMsg}</p>
      <Link
        to="/premium/pricing"
        className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded font-medium whitespace-nowrap ml-4"
      >
        Upgrade
      </Link>
    </div>
  );
}
