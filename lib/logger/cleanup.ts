// Mark this file as server-only to prevent client bundling
import "server-only";

import fs from "fs/promises";

import {
  ensureLogDirExists,
  FRONTEND_LOG_FILE,
  SERVER_LOG_FILE,
} from "@/lib/logger/server/files";

// Fallback default if no env variable is set (only used if LOG_CLEANUP_HOURS is missing)
const FALLBACK_CLEANUP_HOURS = 12;

/**
 * Get log cleanup hours from environment variable.
 * This value is used for both:
 * - How many hours of logs to keep
 * - How often to run cleanup
 * Reads from LOG_CLEANUP_HOURS environment variable.
 * Falls back to FALLBACK_CLEANUP_HOURS if not set or invalid.
 */
const getCleanupHoursFromEnv = (): number => {
  const envValue = process.env.LOG_CLEANUP_HOURS;
  if (!envValue) {
    return FALLBACK_CLEANUP_HOURS;
  }

  const parsed = Number.parseInt(envValue, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    console.warn(
      `[LOGGER] Invalid LOG_CLEANUP_HOURS value: ${envValue}. Using fallback: ${FALLBACK_CLEANUP_HOURS}`,
    );
    return FALLBACK_CLEANUP_HOURS;
  }

  return parsed;
};

const LOG_FILES = [FRONTEND_LOG_FILE, SERVER_LOG_FILE];

const parseTimestampFromLine = (line: string): Date | null => {
  // Lines look like:
  // [2025-01-01T12:34:56.789Z] [LEVEL] Message ...
  const firstBracket = line.indexOf("[");
  const secondBracket = line.indexOf("]", firstBracket + 1);

  if (firstBracket === -1 || secondBracket === -1) {
    return null;
  }

  const raw = line.slice(firstBracket + 1, secondBracket).trim();
  const date = new Date(raw);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
};

const cleanupSingleFile = async (
  filePath: string,
  maxAgeHours: number,
): Promise<void> => {
  try {
    ensureLogDirExists();

    const content = await fs.readFile(filePath, "utf8").catch(error => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        // File does not exist yet – nothing to clean
        return "";
      }
      throw error;
    });

    if (!content) {
      return;
    }

    const cutoff = Date.now() - maxAgeHours * 60 * 60 * 1000;
    const lines = content.split("\n");

    const filtered = lines.filter(line => {
      if (!line.trim()) {
        return false;
      }

      const ts = parseTimestampFromLine(line);

      if (!ts) {
        // If we cannot parse the timestamp, keep the line
        return true;
      }

      return ts.getTime() >= cutoff;
    });

    await fs.writeFile(filePath, filtered.join("\n") + "\n", "utf8");
  } catch (error) {
    console.error(
      "[LOGGER] Failed to clean up log file",
      filePath,
      (error as Error).message,
    );
  }
};

export const cleanupOldLogs = async (maxAgeHours?: number) => {
  const hours = maxAgeHours ?? getCleanupHoursFromEnv();
  await Promise.all(
    LOG_FILES.map(filePath => cleanupSingleFile(filePath, hours)),
  );
};

let cleanupScheduled = false;

/**
 * Schedule periodic cleanup of log files.
 * Configuration is read from environment variable:
 * - LOG_CLEANUP_HOURS: How many hours of logs to keep and how often to run cleanup (default: 96 hours = 4 days)
 *   This single value controls both the retention period and cleanup interval.
 *
 * NOTE: In serverless environments, long-running timers may not be reliable.
 * In that case, you can instead call `cleanupOldLogs` from a cron-triggered
 * route handler.
 */
export const scheduleLogCleanup = ({
  hours,
}: {
  hours?: number;
} = {}) => {
  if (cleanupScheduled) {
    return;
  }

  cleanupScheduled = true;

  // Use provided value or read from environment variable
  // This single value is used for both max age and cleanup interval
  const resolvedHours = hours ?? getCleanupHoursFromEnv();

  // Run once on startup
  void cleanupOldLogs(resolvedHours);

  const intervalMs = resolvedHours * 60 * 60 * 1000;

  // Fire-and-forget; best-effort cleanup
  setInterval(() => {
    void cleanupOldLogs(resolvedHours);
  }, intervalMs).unref?.();
};
