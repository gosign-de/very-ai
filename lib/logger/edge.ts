/**
 * Lightweight structured logger for Edge Runtime routes.
 * Does NOT use `fs` or `server-only` — safe for edge environments.
 */

import { LogLevel, LogMetadata } from "@/lib/logger/types";

interface EdgeLogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  [key: string]: unknown;
}

const consoleMethods: Record<LogLevel, (...args: unknown[]) => void> = {
  debug: console.debug.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};

class EdgeLogger {
  constructor(private readonly context: LogMetadata = {}) {}

  private log(level: LogLevel, message: string, metadata?: LogMetadata) {
    const entry: EdgeLogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      ...this.context,
      ...metadata,
    };
    consoleMethods[level](JSON.stringify(entry));
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
    return new EdgeLogger({ ...this.context, ...context });
  }
}

export const edgeLogger = new EdgeLogger({ service: "app" });

export const createEdgeLogger = (context: LogMetadata) =>
  edgeLogger.child(context);

export type { EdgeLogger };
