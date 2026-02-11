type LogData = Record<string, unknown> | undefined
const isDev = import.meta.env.DEV

export const logger = {
  info: (msg: string, data?: LogData): void => console.log(`[INFO] ${msg}`, data ?? ''),
  warn: (msg: string, data?: LogData): void => console.warn(`[WARN] ${msg}`, data ?? ''),
  error: (msg: string, err?: unknown): void => console.error(`[ERROR] ${msg}`, err ?? ''),
  debug: (msg: string, data?: LogData): void => { if (isDev) console.debug(`[DEBUG] ${msg}`, data ?? '') },

  /** Log duration of an async operation. Returns the operation's result. */
  async time<T>(label: string, fn: () => Promise<T>): Promise<T> {
    const start = performance.now();
    try {
      const result = await fn();
      const ms = Math.round(performance.now() - start);
      console.log(`[PERF] ${label}: ${ms}ms`);
      return result;
    } catch (err) {
      const ms = Math.round(performance.now() - start);
      console.error(`[PERF] ${label}: FAILED after ${ms}ms`, err);
      throw err;
    }
  },
}
