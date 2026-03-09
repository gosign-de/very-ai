import { createClient } from "@/lib/supabase/middleware";
import { NextRequest } from "next/server";

export const routeAuthentication = async (request: NextRequest) => {
  try {
    const { supabase } = createClient(request);
    const { data: sessionData, error: sessionError } =
      await supabase.auth.getSession();

    if (sessionError || !sessionData?.session) {
      return false;
    }

    const userId = sessionData.session.user.id;

    const { data: isAuth, error: authError } = await supabase
      .from("user_groups")
      .select("azure_groups!inner(*)")
      .eq("user_id", userId)
      .eq("azure_groups.role", "admin");

    if (authError || !isAuth || isAuth.length === 0) {
      return false;
    }

    return true;
  } catch (error) {
    return error;
  }
};
