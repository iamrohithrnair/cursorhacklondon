import * as Sentry from "@sentry/node";

Sentry.init({
  dsn: "https://fdd600697dcd92179ba32eb6e9bc43f6@o4511115499929600.ingest.de.sentry.io/4511151857729616",
  tracesSampleRate: 1.0,
  sendDefaultPii: true,
  includeLocalVariables: true,
  environment: "development",
});
