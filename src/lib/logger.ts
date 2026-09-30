import * as Sentry from "@sentry/react";

const isDev = import.meta.env.DEV;

export const logger = {
  error: (message: string, ...args: unknown[]): void => {
    if (isDev) {
      console.error(message, ...args);
      return;
    }
    // Sentry.* safely no-ops if initSentry() never ran (no VITE_SENTRY_DSN
    // configured) — this forwards unconditionally rather than checking a
    // flag here, so a DSN added later starts capturing with no code change.
    const error = args.find((a): a is Error => a instanceof Error);
    if (error) {
      Sentry.captureException(error, { extra: { message, args } });
    } else {
      Sentry.captureMessage(message, { level: "error", extra: { args } });
    }
  },
  warn: (message: string, ...args: unknown[]): void => {
    if (isDev) console.warn(message, ...args);
  },
};
