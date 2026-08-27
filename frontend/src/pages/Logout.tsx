import { useEffect } from "react";

import { apiClient } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";

const Logout = () => {
  const { logout } = useAuthStore();

  useEffect(() => {
    const performLogout = async () => {
      try {
        await apiClient.auth.logout();
      } catch {
        // The server may reject expired tokens; local auth must still be cleared.
      } finally {
        logout();
        window.location.href = "/";
      }
    };

    performLogout();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      className="min-h-screen bg-gray-900 text-gray-100 flex items-center justify-center"
      role="status"
      aria-live="polite"
    >
      <div className="text-center">
        <div
          className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"
          aria-hidden="true"
        />
        <p className="text-gray-300">Logging you out...</p>
        <span className="sr-only">Please wait while you are being logged out</span>
      </div>
    </div>
  );
};

export default Logout;
