type LogData = Record<string, unknown> | undefined
const isDev = import.meta.env.DEV

export const logger = {
  info: (msg: string, data?: LogData): void => console.log(`[INFO] ${msg}`, data ?? ''),
  warn: (msg: string, data?: LogData): void => console.warn(`[WARN] ${msg}`, data ?? ''),
  error: (msg: string, err?: unknown): void => console.error(`[ERROR] ${msg}`, err ?? ''),
  debug: (msg: string, data?: LogData): void => { if (isDev) console.debug(`[DEBUG] ${msg}`, data ?? '') }
}
