import React, { Component, type ReactNode } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import Button from "@/components/Button";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-dvh bg-gray-900 text-gray-100 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-gray-800 rounded-lg p-6 text-center">
            <div className="mb-4">
              <FontAwesomeIcon icon="exclamation-triangle" className="text-red-500 text-4xl mb-4" />
            </div>
            <h1 className="text-xl font-bold mb-2">Something went wrong</h1>
            <p className="text-gray-400 mb-4">
              We encountered an unexpected error. Please try refreshing the page.
            </p>
            <div className="space-y-2 pt-4">
              <Button
                variant="primary"
                onClick={() => window.location.reload()}
                className="w-full justify-center"
              >
                Refresh Page
              </Button>
              <Button
                variant="secondary"
                onClick={() => this.setState({ hasError: false })}
                className="w-full justify-center"
              >
                Try Again
              </Button>
            </div>
            {import.meta.env.DEV && this.state.error && (
              <details className="mt-4 text-left">
                <summary className="cursor-pointer text-sm text-gray-400 hover:text-gray-300">
                  Error Details
                </summary>
                <pre className="mt-2 text-xs bg-gray-900 p-2 rounded overflow-auto">
                  {this.state.error.stack}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
