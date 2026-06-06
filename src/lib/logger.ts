const isDev = import.meta.env.DEV;

export const logger = {
  error: (message: string, ...args: unknown[]): void => {
    if (isDev) console.error(message, ...args);
    // TODO: forward to Sentry / error tracking in production
  },
  warn: (message: string, ...args: unknown[]): void => {
    if (isDev) console.warn(message, ...args);
  },
};
