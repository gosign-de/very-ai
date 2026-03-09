// TODO: Separate into multiple contexts, keeping simple for now

"use client";

import { ChatbotUIContext } from "@/context/context";
import { getProfileByUserId, getProfileImage } from "@/db/profile";
import { getWorkspaceImageFromStorage } from "@/db/storage/workspace-images";
import { getWorkspacesByUserId } from "@/db/workspaces";
import { getUserManagedGroups } from "@/db/azure_groups";
import { convertBlobToBase64 } from "@/lib/blob-to-b64";
import {
  fetchHostedModels,
  fetchOllamaModels,
  fetchOpenRouterModels,
} from "@/lib/models/fetch-models";
import { supabase } from "@/lib/supabase/browser-client";
import { Tables } from "@/supabase/types";
import {
  ChatFile,
  ChatMessage,
  ChatSettings,
  LLM,
  MessageImage,
  OpenRouterLLM,
  WorkspaceImage,
  PinnedMessage,
} from "@/types";
import { AssistantImage } from "@/types/images/assistant-image";
import { VALID_ENV_KEYS } from "@/types/valid-keys";
import { useRouter, usePathname } from "next/navigation";
import { FC, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { createClientLogger } from "@/lib/logger/client";

const logger = createClientLogger({ component: "GlobalState" });

interface GlobalStateProps {
  children: React.ReactNode;
}

export const GlobalState: FC<GlobalStateProps> = ({ children }) => {
  const { t } = useTranslation();

  const router = useRouter();
  const pathname = usePathname();

  // PROFILE STORE
  const [profile, setProfile] = useState<Tables<"profiles"> | null>(null);

  // ITEMS STORE
  const [assistants, setAssistants] = useState<Tables<"assistants">[]>([]);
  const [groupassistants, setGroupAssistants] = useState<
    Tables<"assistants">[]
  >([]);
  const [collections, setCollections] = useState<Tables<"collections">[]>([]);
  const [chats, setChats] = useState<Tables<"chats">[]>([]);
  const [files, setFiles] = useState<Tables<"files">[]>([]);
  const [folders, setFolders] = useState<Tables<"folders">[]>([]);
  const [models, setModels] = useState<Tables<"models">[]>([]);
  const [presets, setPresets] = useState<Tables<"presets">[]>([]);
  const [prompts, setPrompts] = useState<Tables<"prompts">[]>([]);
  const [tools, setTools] = useState<Tables<"tools">[]>([]);
  const [workspaces, setWorkspaces] = useState<Tables<"workspaces">[]>([]);
  const [localIsPinned, setLocalIsPinned] = useState<Record<string, boolean>>(
    {},
  );
  const [pinnedMessages, setPinnedMessages] = useState<PinnedMessage[]>([]);
  // MODELS STORE
  const [envKeyMap, setEnvKeyMap] = useState<Record<string, VALID_ENV_KEYS>>(
    {},
  );
  const [availableHostedModels, setAvailableHostedModels] = useState<LLM[]>([]);
  const [availableLocalModels, setAvailableLocalModels] = useState<LLM[]>([]);
  const [availableOpenRouterModels, setAvailableOpenRouterModels] = useState<
    OpenRouterLLM[]
  >([]);

  // WORKSPACE STORE
  const [selectedWorkspace, setSelectedWorkspace] =
    useState<Tables<"workspaces"> | null>(null);
  const [workspaceImages, setWorkspaceImages] = useState<WorkspaceImage[]>([]);

  // PRESET STORE
  const [selectedPreset, setSelectedPreset] =
    useState<Tables<"presets"> | null>(null);

  // ASSISTANT STORE
  const [selectedAssistant, setSelectedAssistant] =
    useState<Tables<"assistants"> | null>(null);
  const [assistantImages, setAssistantImages] = useState<AssistantImage[]>([]);
  const [groupassistantImages, setGroupAssistantImages] = useState<
    AssistantImage[]
  >([]);
  const [openaiAssistants, setOpenaiAssistants] = useState<any[]>([]);
  // Direct Mode Webhook (cached when assistant is selected)
  const [assistantDirectModeWebhook, setAssistantDirectModeWebhook] = useState<
    any | null
  >(null);

  // PASSIVE CHAT STORE
  const [userInput, setUserInput] = useState<string>("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatSettings, setChatSettings] = useState<ChatSettings>({
    model: "gpt-4o",
    imageModel: "flux.1",
    prompt: t("You are a helpful AI assistant."),
    temperature: 0.5,
    contextLength: 128000, // Set to a reasonable default that works well with most models
    includeProfileContext: true,
    includeWorkspaceInstructions: true,
    embeddingsProvider: "openai",
  });
  const [selectedChat, setSelectedChat] = useState<Tables<"chats"> | null>(
    null,
  );
  const [chatFileItems, setChatFileItems] = useState<Tables<"file_items">[]>(
    [],
  );

  // ACTIVE CHAT STORE
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [firstTokenReceived, setFirstTokenReceived] = useState<boolean>(false);
  const [hasAccess, setHasAccess] = useState<boolean>(true);
  const [contentState, setContentState] = useState<string>("");
  const [archivedChatIds, setArchivedChatIds] = useState<any[]>([]);
  const [dataWithFolders, setDataWithFolders] = useState<any[]>([]);
  const [groupsFolders, setgroupsFolders] = useState<any[]>([]);
  const [isTempChat, setIsTempChat] = useState(false);
  const [abortController, setAbortController] =
    useState<AbortController | null>(null);

  // CHAT INPUT COMMAND STORE
  const [isPromptPickerOpen, setIsPromptPickerOpen] = useState(false);
  const [slashCommand, setSlashCommand] = useState("");
  const [isFilePickerOpen, setIsFilePickerOpen] = useState(false);
  const [hashtagCommand, setHashtagCommand] = useState("");
  const [isToolPickerOpen, setIsToolPickerOpen] = useState(false);
  const [toolCommand, setToolCommand] = useState("");
  const [focusPrompt, setFocusPrompt] = useState(false);
  const [focusFile, setFocusFile] = useState(false);
  const [focusTool, setFocusTool] = useState(false);
  const [focusAssistant, setFocusAssistant] = useState(false);
  const [atCommand, setAtCommand] = useState("");
  const [isAssistantPickerOpen, setIsAssistantPickerOpen] = useState(false);

  // ATTACHMENTS STORE
  const [chatFiles, setChatFiles] = useState<ChatFile[]>([]);
  const [chatImages, setChatImages] = useState<MessageImage[]>([]);
  const [newMessageFiles, setNewMessageFiles] = useState<ChatFile[]>([]);
  const [newMessageImages, setNewMessageImages] = useState<MessageImage[]>([]);
  const [showFilesDisplay, setShowFilesDisplay] = useState<boolean>(false);

  // RETIEVAL STORE
  const [useRetrieval, setUseRetrieval] = useState<boolean>(true);
  const [sourceCount, setSourceCount] = useState<number>(20);

  // TOOL STORE
  const [selectedTools, setSelectedTools] = useState<Tables<"tools">[]>([]);
  const [toolInUse, setToolInUse] = useState<string>("none");

  // THINKING STORE
  const [isThinking, setIsThinking] = useState<boolean>(false);
  const [thinkingContent, setThinkingContent] = useState<string>("");

  // Function to refresh models based on current user groups
  const refreshModels = async () => {
    try {
      if (!profile) return;

      const session = (await supabase.auth.getSession()).data.session;

      // Initialize managed_user_groups if needed, then get ALL groups (not just selected)
      const sessionGroups = (session?.user as any)?.groups || [];
      await getUserManagedGroups(sessionGroups);

      // Get ALL user groups from managed_user_groups (ignore is_selected flag)
      let userGroupIds: string[] = [];
      try {
        const { data: allGroups, error } = await supabase
          .from("managed_user_groups")
          .select("group_id")
          .eq("user_id", session?.user?.id);

        if (!error && allGroups) {
          userGroupIds = allGroups.map((g: any) => g.group_id);
        }
      } catch (error) {
        logger.error("Error fetching user groups", { error: String(error) });
      }

      const hostedModelRes = await fetchHostedModels(profile, userGroupIds);
      if (!hostedModelRes) return;

      setEnvKeyMap(hostedModelRes.envKeyMap);
      setAvailableHostedModels(hostedModelRes.hostedModels);
    } catch (error) {
      logger.error("Error refreshing models", { error: String(error) });
    }
  };

  useEffect(() => {
    (async () => {
      // Get session first
      const session = (await supabase.auth.getSession()).data.session;

      const profile = await fetchStartingData();

      if (profile) {
        // Initialize managed_user_groups table by calling getUserManagedGroups
        // This ensures the table is populated before we fetch group IDs
        const sessionGroups = (session?.user as any)?.groups || [];
        await getUserManagedGroups(sessionGroups);

        // Get ALL user groups from managed_user_groups (ignore is_selected flag)
        let userGroupIds: string[] = [];
        try {
          const { data: allGroups, error } = await supabase
            .from("managed_user_groups")
            .select("group_id")
            .eq("user_id", session?.user?.id);

          if (!error && allGroups) {
            userGroupIds = allGroups.map((g: any) => g.group_id);
          }
        } catch (error) {
          logger.error("Error fetching user groups", { error: String(error) });
        }

        const hostedModelRes = await fetchHostedModels(profile, userGroupIds);
        if (!hostedModelRes) return;

        setEnvKeyMap(hostedModelRes.envKeyMap);
        setAvailableHostedModels(hostedModelRes.hostedModels);

        if (
          profile["openrouter_api_key"] ||
          hostedModelRes.envKeyMap["openrouter"]
        ) {
          const openRouterModels = await fetchOpenRouterModels();
          if (!openRouterModels) return;
          setAvailableOpenRouterModels(openRouterModels);
        }
      }

      if (process.env.NEXT_PUBLIC_OLLAMA_URL) {
        const localModels = await fetchOllamaModels();
        if (!localModels) return;
        setAvailableLocalModels(localModels);
      }
    })();
  }, []);

  const fetchStartingData = async () => {
    const session = (await supabase.auth.getSession()).data.session;

    if (session) {
      const user = session.user;

      const [profile, userPhotoBlob] = await Promise.all([
        getProfileByUserId(user.id),
        getProfileImage(),
      ]);

      if (userPhotoBlob) {
        const base64ProfileImg = await convertBlobToBase64(userPhotoBlob);
        profile.image_url = base64ProfileImg || "";
      }

      setProfile(profile);

      if (!profile.has_onboarded && !pathname?.includes("/no-access")) {
        return router.push("/setup");
      }

      const workspaces = await getWorkspacesByUserId(user.id);
      setWorkspaces(workspaces);

      // Fetch all workspace images in parallel for better performance
      const workspaceImagePromises = workspaces
        .filter(workspace => workspace.image_path)
        .map(async workspace => {
          try {
            const workspaceImageUrl =
              (await getWorkspaceImageFromStorage(workspace.image_path)) || "";

            if (workspaceImageUrl) {
              const response = await fetch(workspaceImageUrl);
              const blob = await response.blob();
              const base64 = await convertBlobToBase64(blob);

              return {
                workspaceId: workspace.id,
                path: workspace.image_path,
                base64: base64,
                url: workspaceImageUrl,
              };
            }
          } catch (error) {
            logger.error(`Error fetching workspace image for ${workspace.id}`, {
              error: String(error),
            });
          }
          return null;
        });

      const workspaceImagesResults = await Promise.all(workspaceImagePromises);
      const validWorkspaceImages = workspaceImagesResults.filter(
        (img): img is WorkspaceImage => img !== null,
      );
      setWorkspaceImages(validWorkspaceImages);

      return profile;
    }
  };

  return (
    <ChatbotUIContext.Provider
      value={{
        // PROFILE STORE
        profile,
        setProfile,

        // ITEMS STORE
        assistants,
        setAssistants,
        groupassistants,
        setGroupAssistants,
        collections,
        setCollections,
        chats,
        setChats,
        files,
        setFiles,
        folders,
        setFolders,
        models,
        setModels,
        presets,
        setPresets,
        prompts,
        setPrompts,
        tools,
        setTools,
        workspaces,
        setWorkspaces,
        groupsFolders,
        setgroupsFolders,

        // MODELS STORE
        envKeyMap,
        setEnvKeyMap,
        availableHostedModels,
        setAvailableHostedModels,
        availableLocalModels,
        setAvailableLocalModels,
        availableOpenRouterModels,
        setAvailableOpenRouterModels,
        refreshModels,

        // WORKSPACE STORE
        selectedWorkspace,
        setSelectedWorkspace,
        workspaceImages,
        setWorkspaceImages,

        // PRESET STORE
        selectedPreset,
        setSelectedPreset,

        // ASSISTANT STORE
        selectedAssistant,
        setSelectedAssistant,
        assistantImages,
        setAssistantImages,
        groupassistantImages,
        setGroupAssistantImages,
        openaiAssistants,
        setOpenaiAssistants,
        assistantDirectModeWebhook,
        setAssistantDirectModeWebhook,

        // PASSIVE CHAT STORE
        userInput,
        setUserInput,
        chatMessages,
        setChatMessages,
        chatSettings,
        setChatSettings,
        selectedChat,
        setSelectedChat,
        chatFileItems,
        setChatFileItems,

        // ACTIVE CHAT STORE
        isGenerating,
        setIsGenerating,
        firstTokenReceived,
        setFirstTokenReceived,
        abortController,
        setAbortController,

        hasAccess,
        setHasAccess,

        contentState,
        setContentState,
        archivedChatIds,
        setArchivedChatIds,
        dataWithFolders,
        setDataWithFolders,

        localIsPinned,
        setLocalIsPinned,
        pinnedMessages,
        setPinnedMessages,
        isTempChat,
        setIsTempChat,

        // CHAT INPUT COMMAND STORE
        isPromptPickerOpen,
        setIsPromptPickerOpen,
        slashCommand,
        setSlashCommand,
        isFilePickerOpen,
        setIsFilePickerOpen,
        hashtagCommand,
        setHashtagCommand,
        isToolPickerOpen,
        setIsToolPickerOpen,
        toolCommand,
        setToolCommand,
        focusPrompt,
        setFocusPrompt,
        focusFile,
        setFocusFile,
        focusTool,
        setFocusTool,
        focusAssistant,
        setFocusAssistant,
        atCommand,
        setAtCommand,
        isAssistantPickerOpen,
        setIsAssistantPickerOpen,

        // ATTACHMENT STORE
        chatFiles,
        setChatFiles,
        chatImages,
        setChatImages,
        newMessageFiles,
        setNewMessageFiles,
        newMessageImages,
        setNewMessageImages,
        showFilesDisplay,
        setShowFilesDisplay,

        // RETRIEVAL STORE
        useRetrieval,
        setUseRetrieval,
        sourceCount,
        setSourceCount,

        // TOOL STORE
        selectedTools,
        setSelectedTools,
        toolInUse,
        setToolInUse,

        // THINKING STORE
        isThinking,
        setIsThinking,
        thinkingContent,
        setThinkingContent,
      }}
    >
      {children}
    </ChatbotUIContext.Provider>
  );
};
