import { getServerProfile } from "@/lib/server/server-chat-helpers";
import { Database } from "@/supabase/types";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ fileId: string }> },
) {
  const logger = createLogger({ feature: "api/retrieval/status" });
  try {
    const { fileId } = await params;
    const supabaseAdmin = createClient<Database>(
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const profile = await getServerProfile();

    const { data: fileMetadata, error: metadataError } = await supabaseAdmin
      .from("files")
      .select(
        "processing_status, processing_progress, error_message, user_id, updated_at",
      )
      .eq("id", fileId)
      .single();

    if (metadataError) {
      return new NextResponse(
        JSON.stringify({
          error: `Failed to retrieve file status: ${metadataError.message}`,
        }),
        { status: 404 },
      );
    }

    if (!fileMetadata) {
      return new NextResponse(JSON.stringify({ message: "File not found" }), {
        status: 404,
      });
    }

    logger.debug("File metadata fetched", {
      fileId,
      processing_status: fileMetadata.processing_status,
      processing_progress: fileMetadata.processing_progress,
    });

    if (fileMetadata.user_id !== profile.user_id) {
      return new NextResponse(JSON.stringify({ message: "Unauthorized" }), {
        status: 403,
      });
    }

    return new NextResponse(
      JSON.stringify({
        processing_status: fileMetadata.processing_status || "pending",
        processing_progress: fileMetadata.processing_progress || 0,
        error_message: fileMetadata.error_message,
        updated_at: fileMetadata.updated_at,
      }),
      { status: 200 },
    );
  } catch (error: unknown) {
    const message = (error as any)?.message || "An unexpected error occurred";
    const stack = (error as any)?.stack;
    logger.error("Error in status check", { message, stack });
    return new NextResponse(
      JSON.stringify({
        error: message,
      }),
      { status: 500 },
    );
  }
}
