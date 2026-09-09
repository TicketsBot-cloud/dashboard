import { useEffect, useState, useRef } from "react";
import { useNavigate, Link } from "react-router";
import { apiClient } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";
import { validateGuilds, validateUser } from "@/lib/storage";

interface OAuthStatePayload {
  path?: unknown;
}

function getSafeRedirectPath(encodedState: string | null): string {
  if (!encodedState) return "/";

  try {
    const payload = JSON.parse(atob(encodedState)) as OAuthStatePayload;
    const path = typeof payload.path === "string" ? payload.path : "/";

    if (!path.startsWith("/") || path.startsWith("//") || path.startsWith("/oauth2/callback")) {
      return "/";
    }

    return path;
  } catch {
    return "/";
  }
}

export default function Callback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const processedRef = useRef(false);
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const returnedState = params.get("state");

  useEffect(() => {
    // Prevent double processing in React StrictMode
    if (processedRef.current) return;

    const processCallback = async () => {
      if (!code) {
        setError("No authorisation code provided");
        setLoading(false);
        return;
      }

      // Validate OAuth state to prevent CSRF
      const storedState = sessionStorage.getItem("oauth_state");
      sessionStorage.removeItem("oauth_state");
      if (!returnedState || !storedState || returnedState !== storedState) {
        setError("Invalid OAuth state - please try logging in again");
        setLoading(false);
        return;
      }
      const redirectPath = getSafeRedirectPath(returnedState);

      try {
        processedRef.current = true;

        const res = await apiClient.auth.callback(code);

        if (res.status !== 200) {
          throw new Error("Failed to fetch callback data");
        }

        // Validate and store token
        if (!res.data.token || typeof res.data.token !== "string") {
          throw new Error("Invalid token received from server");
        }

        // Validate user data
        if (!validateUser(res.data.user_data)) {
          throw new Error("Invalid user data received from server");
        }

        // Validate guilds
        if (!res.data.guilds) {
          throw new Error("No guilds data received from server");
        }
        const validGuilds = validateGuilds(res.data.guilds);

        // Update auth store
        const authStore = useAuthStore.getState();
        authStore.login(res.data.user_data, res.data.token);
        authStore.setGuilds(validGuilds);
        navigate(redirectPath, { replace: true });
      } catch (e) {
        console.error("OAuth callback error:", e);
        setError(e instanceof Error ? e.message : "Authentication failed");
        setLoading(false);

        // Clear any partial data on error
        useAuthStore.getState().logout();
      }
    };

    processCallback();
  }, [code, navigate, returnedState]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">Authenticating...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center max-w-md">
          <div className="text-red-500 text-6xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold mb-2">Authentication Failed</h1>
          <p className="text-gray-600 mb-4">{error}</p>
          <Link to="/" className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">
            Return to Home
          </Link>
        </div>
      </div>
    );
  }

  return null;
}
