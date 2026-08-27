import type { FC } from "react";

const SkipLinks: FC = () => {
  return (
    <div className="sr-only focus-within:not-sr-only">
      <a
        href="#main-content"
        className="absolute top-0 left-0 z-50 bg-blue-600 text-white px-4 py-2 rounded-br-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
      >
        Skip to main content
      </a>
      <a
        href="#navigation"
        className="absolute top-0 left-32 z-50 bg-blue-600 text-white px-4 py-2 rounded-br-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
      >
        Skip to navigation
      </a>
    </div>
  );
};

export default SkipLinks;
