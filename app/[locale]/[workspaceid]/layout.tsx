"use client";
import { createClientLogger } from "@/lib/logger/client";

import { Dashboard } from "@/components/ui/dashboard";

const logger = createClientLogger({ component: "WorkspaceLayout" });
import { ChatbotUIContext } from "@/context/context";
import { getAssistantWorkspacesByWorkspaceId } from "@/db/assistants";
import { getChatsByWorkspaceId } from "@/db/chats";
import { getCollectionWorkspacesByWorkspaceId } from "@/db/collections";
import { getFileWorkspacesByWorkspaceId } from "@/db/files";
import { getFoldersByWorkspaceId } from "@/db/folders";
import { getModelWorkspacesByWorkspaceId } from "@/db/models";
import { getPromptWorkspacesByWorkspaceId } from "@/db/prompts";
import { getPresetWorkspacesByWorkspaceId } from "@/db/presets";
import { getAssistantImageFromStorage } from "@/db/storage/assistant-images";
import { SidebarItem } from "@/components/sidebar/items/all/sidebar-display-item";
import { getToolWorkspacesByWorkspaceId } from "@/db/tools";
import { convertBlobToBase64 } from "@/lib/blob-to-b64";
import { getWorkspaceContextLength } from "@/lib/chat-setting-limits";
import { supabase } from "@/lib/supabase/browser-client";
import { LLMID } from "@/types";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ReactNode, useContext, useEffect, useState } from "react";
import Loading from "../loading";
import { useSession } from "next-auth/react";
import { getAssistantByGroupId } from "@/db/assistants";
import { validateWorkspaceModels } from "@/lib/services/workspace-model-validation";
import { validateAssistantModels } from "@/lib/services/assistant-model-validation";

interface WorkspaceLayoutProps {
  children: ReactNode;
}

export default function WorkspaceLayout({ children }: WorkspaceLayoutProps) {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const workspaceId = params.workspaceid as string;
  const [loading, setLoading] = useState(true);
  const [_userId, setUserId] = useState<string>("");
  const { data: session } = useSession();
  const groups = session?.user?.groups || ([] as { id: string }[]);
  const groupIds = groups.map(group => group.id);

  const {
    chatSettings,
    setChatSettings,
    setAssistants,
    setGroupAssistants,
    setAssistantImages,
    setGroupAssistantImages,
    setChats,
    setCollections,
    setFolders,
    setFiles,
    setPresets,
    setPrompts,
    setTools,
    setModels,
    setSelectedWorkspace,
    setSelectedChat,
    setChatMessages,
    setUserInput,
    setIsGenerating,
    setFirstTokenReceived,
    setChatFiles,
    setChatImages,
    setNewMessageFiles,
    setNewMessageImages,
    setShowFilesDisplay,
  } = useContext(ChatbotUIContext);

  // Track if initial load has happened to prevent duplicate fetches
  const [initialLoadDone, setInitialLoadDone] = useState(false);

  useEffect(() => {
    (async () => {
      const session = (await supabase.auth.getSession()).data.session;
      if (!session) {
        return router.push("/login");
      }
      setUserId(session.user.id);
      await fetchWorkspaceData(workspaceId, session);
      setInitialLoadDone(true);
    })();
  }, []);

  useEffect(() => {
    // Skip the data fetch if this is the initial mount (already handled above)
    // But always reset chat state when workspaceId changes
    if (!initialLoadDone) return;

    resetChatState();

    (async () => {
      const session = (await supabase.auth.getSession()).data.session;
      await fetchWorkspaceData(workspaceId, session);
    })();
  }, [workspaceId]);

  const resetChatState = () => {
    setUserInput("");
    setChatMessages([]);
    setSelectedChat(null);
    setIsGenerating(false);
    setFirstTokenReceived(false);
    setChatFiles([]);
    setChatImages([]);
    setNewMessageFiles([]);
    setNewMessageImages([]);
    setShowFilesDisplay(false);
  };

  const fetchWorkspaceData = async (workspaceId: string, _session: any) => {
    setLoading(true);

    try {
      const { data: workspace, error: workspaceError } = await supabase
        .from("workspaces")
        .select("*")
        .eq("id", workspaceId)
        .single();

      if (workspaceError) throw workspaceError;

      // Validate workspace models and update if needed
      const validatedWorkspace = await validateWorkspaceModels(
        workspace,
        false,
      );
      setSelectedWorkspace(validatedWorkspace);

      // Fetch all workspace data in parallel for better performance
      const [
        assistantData,
        groupassistantData,
        chats,
        collectionData,
        folders,
        fileData,
        presetData,
        promptData,
        toolData,
        modelData,
      ] = await Promise.all([
        getAssistantWorkspacesByWorkspaceId(workspaceId),
        getAssistantByGroupId(groupIds),
        getChatsByWorkspaceId(workspaceId),
        getCollectionWorkspacesByWorkspaceId(workspaceId),
        getFoldersByWorkspaceId(workspaceId),
        getFileWorkspacesByWorkspaceId(workspaceId),
        getPresetWorkspacesByWorkspaceId(workspaceId),
        getPromptWorkspacesByWorkspaceId(workspaceId),
        getToolWorkspacesByWorkspaceId(workspaceId),
        getModelWorkspacesByWorkspaceId(workspaceId),
      ]);

      // Validate both assistant types in parallel for better performance
      const [validatedAssistants, validatedGroupAssistants] = await Promise.all(
        [
          validateAssistantModels(assistantData.assistants || [], false),
          validateAssistantModels(
            groupassistantData.groupassistants || [],
            false,
          ),
        ],
      );

      setAssistants(validatedAssistants);
      setGroupAssistants(validatedGroupAssistants);

      // Set all other data
      setChats(Array.isArray(chats) ? chats : []);
      setCollections(collectionData.collections || []);
      setFolders(Array.isArray(folders) ? folders : []);
      setFiles(fileData.files || []);
      setPresets(presetData.presets || []);
      setPrompts(promptData.prompts || []);
      setTools(toolData.tools || []);
      setModels(modelData.models || []);

      // Helper function to fetch assistant image
      const fetchAssistantImage = async (assistant: any) => {
        let url = "";
        let base64 = "";

        if (assistant.image_path) {
          url =
            (await getAssistantImageFromStorage(assistant.image_path)) || "";
        }

        if (url) {
          try {
            const response = await fetch(url);
            const blob = await response.blob();
            base64 = await convertBlobToBase64(blob);
          } catch (error) {
            logger.error(`Error fetching image for assistant ${assistant.id}`, {
              error: String(error),
            });
          }
        }

        return {
          assistantId: assistant.id,
          path: assistant.image_path,
          base64,
          url,
        };
      };

      // Fetch all assistant images in parallel
      const assistantImagePromises = (assistantData.assistants || []).map(
        fetchAssistantImage,
      );
      const groupAssistantImagePromises = (
        groupassistantData.groupassistants || []
      ).map(fetchAssistantImage);

      const [assistantImages, groupAssistantImages] = await Promise.all([
        Promise.all(assistantImagePromises),
        Promise.all(groupAssistantImagePromises),
      ]);

      setAssistantImages(assistantImages);
      setGroupAssistantImages(groupAssistantImages);

      setChatSettings({
        model: (searchParams.get("model") ||
          validatedWorkspace?.default_model ||
          "gpt-4-1106-preview") as LLMID,
        imageModel: validatedWorkspace?.default_image_model as LLMID,
        prompt:
          workspace?.default_prompt ||
          "You are a friendly, helpful AI assistant.",
        temperature: workspace?.default_temperature || 0.5,
        contextLength: getWorkspaceContextLength(
          workspace?.default_context_length,
          (workspace?.default_model || "gpt-4-1106-preview") as LLMID,
        ),
        includeProfileContext: workspace?.include_profile_context || true,
        includeWorkspaceInstructions:
          workspace?.include_workspace_instructions || true,
        embeddingsProvider:
          (workspace?.embeddings_provider as "openai" | "local") || "openai",
        is_temp_chat: chatSettings?.is_temp_chat || false,
      });
    } catch (error) {
      logger.error("Error fetching workspace data", { error: String(error) });
      setLoading(false);
    }

    setLoading(false);
  };

  if (loading) {
    return <Loading />;
  }

  return (
    <Dashboard>
      <SidebarItem
        item={{
          context_length: 0,
          created_at: "",
          description: "",
          embeddings_provider: "",
          folder_id: "",
          group_id: "",
          id: "",
          image_path: "",
          include_profile_context: false,
          include_workspace_instructions: false,
          model: "",
          image_model: "",
          name: "",
          prompt: "",
          sharing: "",
          temperature: 0,
          updated_at: "",
          user_id: "",
        }}
        isTyping={false}
        contentType={"assistants"}
        icon={""}
        updateState={newState =>
          logger.info("State updated", { data: newState })
        }
        renderInputs={(_renderState: any) => (
          <div>Render inputs using renderState here</div>
        )}
      />
      {children}
    </Dashboard>
  );
}
