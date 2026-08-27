import type { FC } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

/** Compact legend for icon view — intended below the server grid. */
const ServerIconLegend: FC = () => (
  <footer
    className="mt-10 pt-5 border-t border-gray-800 flex flex-wrap justify-center gap-x-8 gap-y-2 text-xs text-gray-400"
    aria-label="Icon legend"
  >
    <span className="inline-flex items-center gap-2">
      <span className="h-4 w-4 rounded-md ring-2 ring-pink-500/90 shrink-0" aria-hidden="true" />
      Premium
    </span>
    <span className="inline-flex items-center gap-2">
      <span className="h-4 w-4 rounded-md bg-gray-600 shrink-0" aria-hidden="true" />
      Free
    </span>
    <span className="inline-flex items-center gap-2">
      <span
        className="relative inline-flex h-4 w-4 shrink-0 opacity-60 grayscale"
        aria-hidden="true"
      >
        <span className="h-4 w-4 rounded-md bg-gray-600 ring-2 ring-gray-600" />
        <span className="absolute -top-px -right-px flex h-2.5 w-2.5 items-center justify-center rounded-full bg-gray-800 text-gray-400 ring-1 ring-gray-700">
          <FontAwesomeIcon icon="lock" className="h-1.5 w-1.5" />
        </span>
      </span>
      No access
    </span>
  </footer>
);

export default ServerIconLegend;
