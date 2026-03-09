import { NextRequest, NextResponse } from "next/server";
import { routeAuthentication } from "@/db/authentication";
import { createClient } from "@/lib/supabase/middleware";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createLogger } from "@/lib/logger";

const logger = createLogger({ feature: "api/admin/user-uploads" });

export async function GET(request: NextRequest) {
  try {
    const auth = await routeAuthentication(request);
    if (!auth) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { supabase } = createClient(request);
    const { data: sessionData } = await supabase.auth.getSession();
    const currentUserId = sessionData?.session?.user?.id;

    if (!currentUserId) {
      return NextResponse.json({ message: "User not found" }, { status: 401 });
    }
    const supabaseAdmin = createServiceClient(
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    );

    const { searchParams } = new URL(request.url);
    const timeFilter = searchParams.get("timeFilter") || "month";
    const fileType = searchParams.get("fileType") || "all";
    const userId = searchParams.get("userId") || "all";

    let query = supabaseAdmin
      .from("files")
      .select(
        `
        id,
        name,
        type,
        original_type,
        size,
        created_at,
        user_id
      `,
      )
      .order("created_at", { ascending: false });

    const now = new Date();
    let startDate: Date;

    switch (timeFilter) {
      case "day":
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case "week":
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case "month":
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case "year":
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      default:
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    query = query.gte("created_at", startDate.toISOString());

    if (userId !== "all") {
      query = query.eq("user_id", userId);
    }

    const { data: files, error } = await query;

    if (error) {
      logger.error("Error fetching files", { error });
      return NextResponse.json(
        { message: "Failed to fetch files" },
        { status: 500 },
      );
    }

    const { data: allUsers, error: usersError } = await supabaseAdmin
      .from("profiles")
      .select("user_id, display_name, username")
      .order("display_name");

    if (usersError) {
      logger.error("Error fetching all users", { error: usersError });
    }

    const uniqueUserIds = [...new Set(files?.map(f => f.user_id) || [])];

    const { data: profiles, error: profilesError } = await supabaseAdmin
      .from("profiles")
      .select("user_id, display_name, username")
      .in("user_id", uniqueUserIds);

    if (profilesError) {
      logger.error("Error fetching profiles", { error: profilesError });
    }

    const profileMap = new Map();
    profiles?.forEach(profile => {
      profileMap.set(profile.user_id, profile);
    });

    let filesWithProfiles =
      files?.map(file => ({
        ...file,
        profiles: profileMap.get(file.user_id) || {
          display_name: "Unknown",
          username: "Unknown",
        },
      })) || [];

    if (fileType !== "all") {
      const fileTypeMap: { [key: string]: string[] } = {
        image: [
          "image/jpeg",
          "image/png",
          "image/gif",
          "image/webp",
          "image/svg+xml",
          "image/bmp",
          "image/ico",
        ],
        pdf: ["application/pdf"],
        excel: [
          "application/vnd.ms-excel",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "text/csv",
        ],
        word: [
          "application/msword",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "application/rtf",
        ],
        powerpoint: [
          "application/vnd.ms-powerpoint",
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        ],
        zip: [
          "application/zip",
          "application/x-zip-compressed",
          "application/x-rar-compressed",
          "application/x-7z-compressed",
        ],
        text: [
          "text/plain",
          "text/markdown",
          "application/json",
          "application/xml",
          "text/html",
          "text/css",
          "text/javascript",
          "application/typescript",
        ],
        other: [],
      };

      if (fileTypeMap[fileType]) {
        const _beforeFilter = filesWithProfiles.length;
        filesWithProfiles = filesWithProfiles.filter(file => {
          const mimeType = file.original_type || file.type;
          return fileTypeMap[fileType].includes(mimeType);
        });
      }
    }

    const analytics = {
      totalFiles: filesWithProfiles.length,
      totalSize: filesWithProfiles.reduce(
        (sum, file) => sum + (file.size || 0),
        0,
      ),
      uniqueUsers: new Set(filesWithProfiles.map(f => f.user_id)).size,
      fileTypeDistribution: {} as { [key: string]: number },
      timeDistribution: {} as { [key: string]: number },
      userDistribution: {} as { [key: string]: number },
    };

    filesWithProfiles.forEach(file => {
      const mimeType = file.original_type || file.type;
      const category = getFileCategoryFromMimeType(mimeType);
      analytics.fileTypeDistribution[category] =
        (analytics.fileTypeDistribution[category] || 0) + 1;
    });

    filesWithProfiles.forEach(file => {
      const date = new Date(file.created_at);
      let key: string;

      switch (timeFilter) {
        case "day":
          key = date.toLocaleTimeString("en-US", {
            hour: "2-digit",
            hour12: false,
          });
          break;
        case "week":
          key = date.toLocaleDateString("en-US", { weekday: "short" });
          break;
        case "month":
          key = date.toLocaleDateString("en-US", { day: "numeric" });
          break;
        case "year":
          key = date.toLocaleDateString("en-US", { month: "short" });
          break;
        default:
          key = date.toLocaleDateString("en-US", { day: "numeric" });
      }

      analytics.timeDistribution[key] =
        (analytics.timeDistribution[key] || 0) + 1;
    });

    filesWithProfiles.forEach(file => {
      const userName =
        file.profiles?.display_name || file.profiles?.username || "Unknown";
      analytics.userDistribution[userName] =
        (analytics.userDistribution[userName] || 0) + 1;
    });

    return NextResponse.json({
      success: true,
      data: {
        files: filesWithProfiles,
        analytics,
        users: allUsers || [],
        filters: {
          timeFilter,
          fileType,
          userId,
        },
      },
    });
  } catch (error) {
    logger.error("Error in user uploads API", {
      error:
        error instanceof Error
          ? { message: error.message, name: error.name }
          : error,
    });
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 },
    );
  }
}

function getFileCategoryFromMimeType(mimeType: string): string {
  if (!mimeType) return "other";

  if (mimeType.startsWith("image/")) return "image";
  if (mimeType === "application/pdf") return "pdf";
  if (
    mimeType.includes("excel") ||
    mimeType.includes("spreadsheet") ||
    mimeType === "text/csv"
  )
    return "excel";
  if (
    mimeType.includes("word") ||
    mimeType.includes("document") ||
    mimeType === "application/rtf"
  )
    return "word";
  if (mimeType.includes("powerpoint") || mimeType.includes("presentation"))
    return "powerpoint";
  if (
    mimeType.includes("zip") ||
    mimeType.includes("compressed") ||
    mimeType.includes("rar") ||
    mimeType.includes("7z")
  )
    return "zip";
  if (
    mimeType.startsWith("text/") ||
    mimeType === "application/json" ||
    mimeType === "application/xml" ||
    mimeType === "text/html" ||
    mimeType === "text/css" ||
    mimeType === "text/javascript" ||
    mimeType === "application/typescript"
  )
    return "text";
  return "other";
}
