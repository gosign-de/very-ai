import "server-only";

import fs from "fs/promises";
import { NextRequest, NextResponse } from "next/server";

import {
  ensureLogDirExists,
  FRONTEND_LOG_FILE,
  SERVER_LOG_FILE,
} from "@/lib/logger/server/files";
import { createLogger } from "@/lib/logger";

const logger = createLogger({ feature: "api/logs/server" });

const DEFAULT_LOOKBACK_HOURS = 2;
const MAX_LOOKBACK_HOURS = 168; // one week

const parseTimestampFromLine = (line: string): Date | null => {
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

const normalizeToken = (token: string): string => {
  return token.trim().replace(/\s+/g, " ");
};

const normalizeTokenForComparison = (token: string): string => {
  return token.trim().replace(/[\s\+]/g, ""); // Remove all whitespace and + characters
};

const extractToken = (request: NextRequest): string | null => {
  const header = request.headers.get("authorization");

  if (header?.startsWith("Bearer ")) {
    return normalizeToken(header.slice("Bearer ".length));
  }

  const tokenParam = request.nextUrl.searchParams.get("token");
  if (!tokenParam) {
    return null;
  }
  return normalizeToken(tokenParam);
};

const resolveLookbackHours = (request: NextRequest) => {
  const hoursParam = request.nextUrl.searchParams.get("hours");

  if (!hoursParam) {
    return DEFAULT_LOOKBACK_HOURS;
  }

  const parsed = Number.parseInt(hoursParam, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return DEFAULT_LOOKBACK_HOURS;
  }

  return Math.min(parsed, MAX_LOOKBACK_HOURS);
};

type LogSource = "server" | "frontend";

const resolveLogSource = (
  request: NextRequest,
): { type: LogSource; filePath: string } => {
  const sourceParam =
    request.nextUrl.searchParams.get("source") ??
    request.nextUrl.searchParams.get("type");

  if (sourceParam === "frontend") {
    return { type: "frontend", filePath: FRONTEND_LOG_FILE };
  }

  return { type: "server", filePath: SERVER_LOG_FILE };
};

export async function GET(request: NextRequest) {
  const expectedToken = process.env.LOG_ACCESS_TOKEN;

  if (!expectedToken) {
    return NextResponse.json(
      { error: "Log access token is not configured." },
      { status: 500 },
    );
  }

  const providedToken = extractToken(request);

  if (!providedToken) {
    logger.error("No token provided in request");
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const normalizedExpected = expectedToken.trim().replace(/\s+/g, " "); // Replace multiple whitespace with single space

  const tokensMatch =
    providedToken === normalizedExpected ||
    normalizeTokenForComparison(providedToken) ===
      normalizeTokenForComparison(normalizedExpected);

  if (!tokensMatch) {
    logger.error("Token mismatch", {
      providedLength: providedToken.length,
      expectedLength: normalizedExpected.length,
    });
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const lookbackHours = resolveLookbackHours(request);
  const { filePath, type } = resolveLogSource(request);
  const cutoff = Date.now() - lookbackHours * 60 * 60 * 1000;

  ensureLogDirExists();

  let content = "";
  try {
    content = await fs.readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      logger.error("Failed to read log file", {
        logType: type,
        error: { message: (error as Error).message },
      });
      return NextResponse.json(
        { error: "Failed to read log file" },
        { status: 500 },
      );
    }
  }

  if (!content) {
    return NextResponse.json(
      {
        source: type,
        hours: lookbackHours,
        entries: [],
      },
      { status: 200 },
    );
  }

  const entries = content
    .split("\n")
    .filter(line => line.trim().length > 0)
    .filter(line => {
      const timestamp = parseTimestampFromLine(line);
      if (!timestamp) {
        return false;
      }
      return timestamp.getTime() >= cutoff;
    });

  return NextResponse.json(
    {
      source: type,
      hours: lookbackHours,
      count: entries.length,
      entries,
    },
    { status: 200 },
  );
}
