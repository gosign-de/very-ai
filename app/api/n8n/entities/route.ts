import { NextRequest, NextResponse } from "next/server";
import { routeAuthentication } from "@/db/authentication";
import { createClient } from "@/lib/supabase/middleware";
import { getServerProfile } from "@/lib/server/server-chat-helpers";
import { fetchHostedModelsServer } from "@/lib/models/fetch-models-server";
import { createLogger } from "@/lib/logger";

const logger = createLogger({ feature: "api/n8n/entities" });

// GET - Fetch available models and assistants for webhook assignment
export async function GET(request: NextRequest) {
  try {
    const auth = await routeAuthentication(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { supabase } = createClient(request);
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData?.session?.user?.id;

    if (!userId) {
      return NextResponse.json({ error: "User not found" }, { status: 401 });
    }

    // Fetch user's assistants
    const { data: assistants, error: assistantsError } = await supabase
      .from("assistants")
      .select("id, name, description, model")
      .eq("user_id", userId)
      .order("name", { ascending: true });

    if (assistantsError) {
      logger.error("Error fetching assistants", { error: assistantsError });
      return NextResponse.json(
        { error: assistantsError.message },
        { status: 500 },
      );
    }

    // Fetch custom models from database
    const { data: dbModels } = await supabase
      .from("models")
      .select("model_id, name")
      .eq("user_id", userId)
      .order("name", { ascending: true });

    // Fetch available models dynamically (same as chat interface)
    const profile = await getServerProfile();
    const hostedModelsRes = await fetchHostedModelsServer(profile);

    let models: Array<{ id: string; name: string; provider: string }> = [];

    // Add custom models from database
    if (dbModels && dbModels.length > 0) {
      models.push(
        ...dbModels.map(m => ({
          id: m.model_id,
          name: m.name,
          provider: "Custom",
        })),
      );
    }

    // Add hosted models (only text-based, no image models)
    if (hostedModelsRes && hostedModelsRes.hostedModels) {
      const textModels = hostedModelsRes.hostedModels.filter(
        m => !m.imageInput,
      );

      models.push(
        ...textModels.map(m => {
          // Format provider name
          let providerName = m.provider.toUpperCase();
          if (m.provider === "openai" && profile.use_azure_openai) {
            providerName = "AZURE OPENAI";
          }

          return {
            id: m.modelId,
            name: m.modelName,
            provider: providerName,
          };
        }),
      );
    }

    // Remove duplicates based on model id
    const uniqueModels = models.filter(
      (model, index, self) => index === self.findIndex(m => m.id === model.id),
    );

    return NextResponse.json(
      {
        success: true,
        data: {
          models: uniqueModels,
          assistants: assistants || [],
        },
      },
      { status: 200 },
    );
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error("Error in GET /api/n8n/entities", {
      error:
        error instanceof Error
          ? { message: error.message, name: error.name }
          : error,
    });
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 },
    );
  }
}
