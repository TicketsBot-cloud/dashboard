import type { FC } from "react";
import { Link, useLocation } from "react-router";
import { useAuthStore } from "@/stores/auth";
import { isAtLeast } from "@/lib/admin-tier";
import type { AdminTier } from "@/types";

interface Tab {
  label: string;
  path: string;
  minTier: AdminTier;
}

const tabs: Tab[] = [
  { label: "Bot Staff", path: "/admin/bot-staff", minTier: "admin" },
  { label: "Premium", path: "/admin/premium", minTier: "admin" },
  { label: "Polar Products", path: "/admin/polar-products", minTier: "owner" },
  { label: "SKUs", path: "/admin/skus", minTier: "owner" },
  { label: "Gallery", path: "/admin/gallery", minTier: "helper" },
  { label: "Integrations", path: "/admin/integrations", minTier: "admin" },
  { label: "Affiliates", path: "/admin/affiliate", minTier: "admin" },
  { label: "Analytics", path: "/admin/analytics", minTier: "admin" },
  { label: "Feature Flags", path: "/admin/flags", minTier: "owner" },
  { label: "Audit Log", path: "/admin/audit-log", minTier: "admin" },
  { label: "Global Blacklist", path: "/admin/global-blacklist", minTier: "owner" },
  { label: "Server Blacklist", path: "/admin/server-blacklist", minTier: "helper" },
  { label: "Utilities", path: "/admin/utilities", minTier: "owner" },
];

const AdminTabBar: FC = () => {
  const location = useLocation();
  const { user } = useAuthStore();
  const userTier = user?.admin_tier ?? "";

  const visibleTabs = tabs.filter((tab) => isAtLeast(userTier, tab.minTier));

  return (
    <nav
      className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-center mb-6"
      aria-label="Admin navigation"
    >
      {visibleTabs.map((tab) => {
        const isActive = location.pathname.startsWith(tab.path);
        return (
          <Link
            key={tab.path}
            to={tab.path}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors text-center w-full sm:w-36 ${
              isActive
                ? "bg-blue-600 text-white"
                : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white"
            }`}
            aria-current={isActive ? "page" : undefined}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
};

export default AdminTabBar;
