import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import Router from "@/router";
import { QueryProvider } from "@/providers/QueryProvider";
import { BASE_URL, KB_DOMAIN } from "@/lib/constants";
import * as Sentry from "@sentry/react";

import { library } from "@fortawesome/fontawesome-svg-core";
import {
  faArrowLeft,
  faBars,
  faCheckCircle,
  faCog,
  faEdit,
  faExclamationCircle,
  faExclamationTriangle,
  faFileText,
  faInfoCircle,
  faLock,
  faQuestionCircle,
  faSearch,
  faServer,
  faSignOutAlt,
  faTimes,
  faUserSecret,
  faMousePointer,
  faPlus,
  faShield,
  faUserShield,
  faSquareCaretLeft,
  faRightToBracket,
} from "@fortawesome/free-solid-svg-icons";

library.add(
  faServer,
  faEdit,
  faUserSecret,
  faSignOutAlt,
  faQuestionCircle,
  faSearch,
  faLock,
  faBars,
  faTimes,
  faArrowLeft,
  faCheckCircle,
  faExclamationCircle,
  faExclamationTriangle,
  faInfoCircle,
  faCog,
  faFileText,
  faMousePointer,
  faPlus,
  faShield,
  faUserShield,
  faSquareCaretLeft,
  faRightToBracket,
);

const sentryDsn = import.meta.env.VITE_SENTRY_DSN;

if (window.location.hostname === KB_DOMAIN && window.location.pathname === "/") {
  window.location.replace(BASE_URL + window.location.search + window.location.hash);
} else {
  if (sentryDsn) {
    Sentry.init({
      dsn: sentryDsn,
      sendDefaultPii: false,
      integrations: [Sentry.replayIntegration()],
      replaysSessionSampleRate: import.meta.env.PROD ? 0.1 : 0,
      replaysOnErrorSampleRate: import.meta.env.PROD ? 1.0 : 0,
    });
  }

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <QueryProvider>
        <Router />
      </QueryProvider>
    </StrictMode>,
  );
}
