export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogMetadata = Record<string, unknown> & {
  userId?: string;
  email?: string;
  workspaceId?: string;
  requestId?: string;
  feature?: string;
  action?: string;
};
