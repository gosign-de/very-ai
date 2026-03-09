// Server-only logger exports
// This file should only be imported in server-side code (API routes, server components, server actions)
// Use dynamic imports or ensure this is never imported in client components

export { serverLogger, createLogger } from "./server";
export type { ServerLogger } from "./server";
export type { LogLevel, LogMetadata } from "./types";
