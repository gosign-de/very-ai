"use server";

import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { createLogger } from "@/lib/logger";

const logger = createLogger({ feature: "auth/getUser" });

export const getUser = async username => {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data: user, error } = await supabase
    .from("users")
    .select("*")
    .eq("email", username)
    .single();

  if (error) {
    logger.error("Error checking user", {
      error:
        error instanceof Error
          ? { message: error.message, name: error.name }
          : error,
    });
    return;
  }

  return user;
};
