import { Link } from "react-router";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import Button from "@/components/Button";

export default function NotFound() {
  const canGoBack = !!document.referrer && document.referrer.startsWith(window.location.origin);

  return (
    <div className="relative flex items-center justify-center h-full px-4 pb-16 md:pb-24 overflow-hidden">
      {/* Ambient glow */}
      <div
        className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_60%_40%_at_50%_35%,rgba(59,130,246,0.08)_0%,transparent_70%)]"
        aria-hidden="true"
      />

      <div className="flex flex-col items-center text-center max-w-md w-full relative">
        {/* Logo */}
        <img
          src="/logo.webp"
          alt=""
          aria-hidden="true"
          className="h-48 w-full object-contain drop-shadow-lg mb-4"
        />

        {/* Card */}
        <div className="bg-gray-800/50 border border-gray-700 rounded-2xl p-8 w-full">
          <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">Page not found</h1>
          <p className="text-gray-300 mb-6">The page you're looking for doesn't exist.</p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              to="/"
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors"
            >
              <FontAwesomeIcon icon="arrow-left" />
              Home
            </Link>
            {canGoBack && (
              <Button
                variant="outline"
                onClick={() => window.history.back()}
                className="gap-2 px-5 py-2.5 rounded-lg font-medium"
              >
                Go back
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
