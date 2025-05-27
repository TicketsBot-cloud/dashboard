import App from './App.svelte';

import * as Sentry from "@sentry/svelte";
import { SENTRY } from './js/constants';

Sentry.init({
	dsn: SENTRY.dsn,
	integrations: [
	  Sentry.browserTracingIntegration(),
	  Sentry.replayIntegration(),
	],
	tracesSampleRate: SENTRY.tracesSampleRate,
	tracePropagationTargets: ["localhost", /^https:\/\/yourserver\.io\/api/],
	replaysSessionSampleRate: SENTRY.replaysSessionSampleRate,
	replaysOnErrorSampleRate: SENTRY.replaysOnErrorSampleRate,
  });

const app = new App({
	target: document.body
});

export default app;