// Re-export types for client and server use
export type { LogLevel, LogMetadata } from "@/lib/logger/types";

// Server-only logger exports
// IMPORTANT: These exports use Node.js fs/promises and will cause build errors if imported in client components
// For server-side code, import directly from this file
// The server-only package will prevent client bundling
export { serverLogger, createLogger } from "./server";
export type { ServerLogger } from "./server";
