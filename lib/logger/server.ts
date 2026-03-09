// Mark this file as server-only to prevent client bundling
// This will cause a build error if imported in client components
import "server-only";

import fs from "fs/promises";

import { ensureLogDirExists, SERVER_LOG_FILE } from "@/lib/logger/server/files";
import { scheduleLogCleanup } from "@/lib/logger/cleanup";
import { LogLevel, LogMetadata } from "@/lib/logger/types";

type InternalMetadata = LogMetadata | undefined;

const consoleMethods: Record<LogLevel, (...args: unknown[]) => void> = {
  debug: console.debug.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};

const formatMetadata = (metadata: InternalMetadata) => {
  if (!metadata || Object.keys(metadata).length === 0) {
    return undefined;
  }

  const replacer = (_key: string, value: unknown) => {
    if (value instanceof Error) {
      return {
        name: value.name,
        message: value.message,
        stack: value.stack,
      };
    }

    if (typeof value === "bigint") {
      return value.toString();
    }

    if (value instanceof Map) {
      return Object.fromEntries(value);
    }

    if (value instanceof Set) {
      return Array.from(value);
    }

    return value;
  };

  try {
    return JSON.stringify(metadata, replacer);
  } catch (error) {
    return JSON.stringify({
      serializationError: (error as Error).message,
    });
  }
};

const writeToFile = async (line: string) => {
  try {
    await fs.appendFile(SERVER_LOG_FILE, `${line}\n`, "utf8");
  } catch (error) {
    console.error(
      `[LOGGER] Failed to append to ${SERVER_LOG_FILE}`,
      (error as Error).message,
    );
  }
};

ensureLogDirExists();
// Best-effort background cleanup of old log entries
scheduleLogCleanup();

const logInternal = async (
  level: LogLevel,
  message: string,
  metadata?: LogMetadata,
) => {
  const timestamp = new Date().toISOString();
  const metadataString = formatMetadata(metadata);
  const logLine = `[${timestamp}] [${level.toUpperCase()}] ${message}${
    metadataString ? ` | ${metadataString}` : ""
  }`;

  const consoleMethod = consoleMethods[level] ?? console.info.bind(console);
  if (metadata && Object.keys(metadata).length > 0) {
    consoleMethod(logLine, metadata);
  } else {
    consoleMethod(logLine);
  }

  await writeToFile(logLine);
};

class ServerLogger {
  constructor(private readonly context: LogMetadata = {}) {}

  private mergeMetadata(metadata?: LogMetadata): LogMetadata | undefined {
    if (!metadata && !this.context) {
      return undefined;
    }

    return {
      ...(this.context ?? {}),
      ...(metadata ?? {}),
    };
  }

  debug(message: string, metadata?: LogMetadata) {
    void logInternal("debug", message, this.mergeMetadata(metadata));
  }

  info(message: string, metadata?: LogMetadata) {
    void logInternal("info", message, this.mergeMetadata(metadata));
  }

  warn(message: string, metadata?: LogMetadata) {
    void logInternal("warn", message, this.mergeMetadata(metadata));
  }

  error(message: string, metadata?: LogMetadata) {
    void logInternal("error", message, this.mergeMetadata(metadata));
  }

  child(context: LogMetadata) {
    return new ServerLogger({
      ...(this.context ?? {}),
      ...(context ?? {}),
    });
  }
}

export const serverLogger = new ServerLogger({ service: "app" });

export const createLogger = (context: LogMetadata) =>
  serverLogger.child(context);

export type { ServerLogger };
