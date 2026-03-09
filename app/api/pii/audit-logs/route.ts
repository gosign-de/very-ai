import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/middleware";
import { createLogger } from "@/lib/logger";

const logger = createLogger({ feature: "api/pii/audit-logs" });

export async function GET(req: NextRequest) {
  try {
    const { supabase } = createClient(req);
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData?.session?.user?.id;

    if (!userId) {
      return NextResponse.json({ message: "User not found" }, { status: 401 });
    }

    const url = new URL(req.url);
    const params = Object.fromEntries(url.searchParams.entries()) as Record<
      string,
      string
    >;
    const page = Number(params.page ?? 1);
    const limit = Math.min(Number(params.limit ?? 10), 100);
    const offset = (page - 1) * limit;

    const sortBy = params.sortBy ?? "created_at";
    const sortDir =
      (params.sortDir ?? "desc").toLowerCase() === "asc" ? "asc" : "desc";
    const search = params.search ?? "";

    let query = supabase
      .from("pii_audit_logs")
      .select("*", { count: "exact" })
      .order(sortBy, { ascending: sortDir === "asc" });

    // search across user_email and pii_type (case-insensitive)
    if (search && search.trim().length > 0) {
      const pattern = `%${search.trim()}%`;
      query = query.or(
        `user_email.ilike.${pattern},pii_type.ilike.${pattern},model_id.ilike.${pattern}`,
      );
    }

    const { data, error, count } = await query.range(
      offset,
      offset + limit - 1,
    );

    if (error) {
      logger.error("Supabase error", { error });
      return NextResponse.json({ message: error.message }, { status: 500 });
    }

    return NextResponse.json({
      data: data ?? [],
      pagination: {
        page,
        limit,
        total: count ?? 0,
        pages: Math.ceil((count ?? 0) / limit),
      },
    });
  } catch (err: unknown) {
    logger.error("AuditLogs API error", {
      error:
        err instanceof Error ? { message: err.message, name: err.name } : err,
    });
    const errObj = err instanceof Error ? err : new Error(String(err));
    return NextResponse.json({ message: errObj.message }, { status: 500 });
  }
}
