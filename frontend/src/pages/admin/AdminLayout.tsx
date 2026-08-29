import { useEffect, useState } from "react";
import { Navigate, Outlet, useNavigate } from "react-router";
import { useAuthStore } from "@/stores/auth";
import { isAnyAdmin } from "@/lib/admin-tier";
import { apiClient } from "@/lib/api";
import AdminTabBar from "@/components/AdminTabBar";
import { toast } from "sonner";

export default function AdminLayout() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    if (!user || !isAnyAdmin(user.admin_tier)) return;

    let cancelled = false;
    apiClient.admin
      .verify()
      .then((res) => {
        if (cancelled) return;
        if (res.status === 401) {
          toast.warning("You do not have permission to access admin pages.");
          navigate("/", { replace: true });
        } else {
          setVerified(true);
        }
      })
      .catch(() => {
        if (cancelled) return;
        toast.error("Failed to verify admin access.");
        navigate("/", { replace: true });
      });

    return () => {
      cancelled = true;
    };
  }, [user, navigate]);

  if (!user || !isAnyAdmin(user.admin_tier)) {
    return <Navigate to="/" replace />;
  }

  if (!verified) {
    return null;
  }

  return (
    <div className="p-4 sm:p-8 md:p-12 lg:p-15">
      <div className="max-w-6xl mx-auto">
        <AdminTabBar />
        <Outlet />
      </div>
    </div>
  );
}
