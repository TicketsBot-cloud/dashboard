import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router";

import { apiClient } from "@/lib/api";

type Status = "loading" | "success" | "error";

const Unsubscribe = () => {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<Status>("loading");
  const [category, setCategory] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");

  useEffect(() => {
    const token = searchParams.get("token");
    if (!token) {
      setErrorMessage("No unsubscribe token provided.");
      setStatus("error");
      return;
    }

    const processUnsubscribe = async () => {
      try {
        const res = await apiClient.unsubscribe.process(token);
        if (res.data.success) {
          setCategory(res.data.category);
          setStatus("success");
        } else {
          setErrorMessage("Failed to process unsubscribe request.");
          setStatus("error");
        }
      } catch {
        setErrorMessage("This unsubscribe link is invalid or has expired.");
        setStatus("error");
      }
    };

    processUnsubscribe();
  }, [searchParams]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-900 px-4">
      <div className="w-full max-w-md rounded-xl border border-gray-700 bg-gray-800 p-8 text-center">
        {status === "loading" && (
          <>
            <div
              className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-blue-500"
              aria-hidden="true"
            />
            <p className="text-gray-300">Processing your request...</p>
          </>
        )}

        {status === "success" && (
          <>
            <div className="mb-4 text-5xl text-emerald-400" aria-hidden="true">
              &#10003;
            </div>
            <h1 className="mb-3 text-2xl font-semibold text-white">Unsubscribed</h1>
            <p className="mb-3 text-gray-300">
              You have been unsubscribed from <strong>{category}</strong> email notifications.
            </p>
            <p className="text-sm text-gray-400">
              You can manage all your notification preferences in your{" "}
              <Link to="/settings" className="text-blue-400 underline hover:text-blue-300">
                dashboard settings
              </Link>
              .
            </p>
          </>
        )}

        {status === "error" && (
          <>
            <h1 className="mb-3 text-2xl font-semibold text-white">Invalid Link</h1>
            <p className="mb-3 text-gray-300">{errorMessage}</p>
            <p className="text-sm text-gray-400">
              Please manage your notification preferences in your{" "}
              <Link to="/settings" className="text-blue-400 underline hover:text-blue-300">
                dashboard settings
              </Link>
              .
            </p>
          </>
        )}
      </div>
    </div>
  );
};

export default Unsubscribe;
