// Mark this file as server-only to prevent client bundling
import "server-only";

import fs from "fs";
import path from "path";

export const LOG_DIR = path.join(process.cwd(), "logs");
export const FRONTEND_LOG_FILE = path.join(LOG_DIR, "frontend.log");
export const SERVER_LOG_FILE = path.join(LOG_DIR, "server.log");

/**
 * Ensures the log directory exists before attempting to write files.
 * This is safe to call multiple times.
 */
export const ensureLogDirExists = () => {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
};
