import fs from "fs/promises";

import {
  ensureLogDirExists,
  FRONTEND_LOG_FILE,
} from "@/lib/logger/server/files";
import type { LogLevel, LogMetadata } from "@/lib/logger/types";
import { getServerProfile } from "@/lib/server/server-chat-helpers";

const consoleMethods: Record<LogLevel, (...args: unknown[]) => void> = {
  debug: console.debug.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};

const isLogLevel = (value: unknown): value is LogLevel =>
  value === "debug" ||
  value === "info" ||
  value === "warn" ||
  value === "error";

const safeStringify = (metadata?: LogMetadata) => {
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

export async function POST(req: Request) {
  const _profile = await getServerProfile();

  const body = await req.json();
  const { level, message, timestamp, metadata } = body as {
    level?: LogLevel;
    message?: string;
    timestamp?: string;
    metadata?: LogMetadata;
  };

  const resolvedLevel = isLogLevel(level) ? level : "info";
  const resolvedTimestamp = timestamp || new Date().toISOString();
  const resolvedMessage =
    typeof message === "string" ? message : JSON.stringify(message);

  const metadataString = safeStringify(metadata);
  const logLine = `[${resolvedTimestamp}] [${resolvedLevel.toUpperCase()}] ${resolvedMessage}${
    metadataString ? ` | ${metadataString}` : ""
  }`;

  ensureLogDirExists();

  const consoleMethod =
    consoleMethods[resolvedLevel] ?? console.info.bind(console);

  if (metadata && Object.keys(metadata).length > 0) {
    consoleMethod(`[FRONTEND] ${logLine}`, metadata);
  } else {
    consoleMethod(`[FRONTEND] ${logLine}`);
  }

  await fs.appendFile(FRONTEND_LOG_FILE, `${logLine}\n`, "utf8");

  return new Response(JSON.stringify({ success: true }), { status: 200 });
}
