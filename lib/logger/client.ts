/**
 * Universal lightweight logger for client components and shared code.
 * Uses structured console output. No server-only dependencies.
 * Safe to import from both client and server contexts.
 */

type LogLevel = "debug" | "info" | "warn" | "error";
type LogMetadata = Record<string, unknown>;

const consoleMethods: Record<LogLevel, (...args: unknown[]) => void> = {
  debug: console.debug.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};

class ClientLogger {
  constructor(private readonly context: LogMetadata = {}) {}

  private log(level: LogLevel, message: string, metadata?: LogMetadata) {
    const merged = { ...this.context, ...metadata };
    const hasMetadata = Object.keys(merged).length > 0;
    const prefix = `[${level.toUpperCase()}]`;

    if (hasMetadata) {
      consoleMethods[level](`${prefix} ${message}`, merged);
    } else {
      consoleMethods[level](`${prefix} ${message}`);
    }
  }

  debug(message: string, metadata?: LogMetadata) {
    this.log("debug", message, metadata);
  }

  info(message: string, metadata?: LogMetadata) {
    this.log("info", message, metadata);
  }

  warn(message: string, metadata?: LogMetadata) {
    this.log("warn", message, metadata);
  }

  error(message: string, metadata?: LogMetadata) {
    this.log("error", message, metadata);
  }

  child(context: LogMetadata) {
    return new ClientLogger({ ...this.context, ...context });
  }
}

export const clientLogger = new ClientLogger();

export const createClientLogger = (context: LogMetadata) =>
  clientLogger.child(context);

export type { ClientLogger };
