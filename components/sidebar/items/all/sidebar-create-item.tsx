"use client";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ChatbotUIContext } from "@/context/context";
import { createAssistantCollections } from "@/db/assistant-collections";
import { createAssistantFiles } from "@/db/assistant-files";
import { createAssistantTools } from "@/db/assistant-tools";
import { createAssistant, updateAssistant } from "@/db/assistants";
import { createChat } from "@/db/chats";
import { createCollectionFiles } from "@/db/collection-files";
import { createCollection } from "@/db/collections";
import {
  createFileBasedOnExtension,
  getFileWorkspacesByWorkspaceId,
  checkFileExistence,
  checkFileInWorkspace,
  createFileWorkspace,
} from "@/db/files";
import { createModel } from "@/db/models";
import { createPreset } from "@/db/presets";
import { createPrompt } from "@/db/prompts";
import {
  getAssistantImageFromStorage,
  uploadAssistantImage,
} from "@/db/storage/assistant-images";
import { createTool } from "@/db/tools";
import { convertBlobToBase64 } from "@/lib/blob-to-b64";
import { Tables, TablesInsert } from "@/supabase/types";
import { ContentType } from "@/types";
import { FC, useContext, useRef, useState } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import logger from "@/app/utils/logger";

interface SidebarCreateItemProps {
  isOpen: boolean;
  isTyping: boolean;
  isValid?: boolean;
  onOpenChange: (isOpen: boolean) => void;
  contentType: ContentType;
  renderInputs: () => React.ReactNode;
  createState: any;
  onBeforeCreate?: () => Promise<any>;
  onValidate?: () => boolean;
}

export const SidebarCreateItem: FC<SidebarCreateItemProps> = ({
  isOpen,
  onOpenChange,
  contentType,
  renderInputs,
  createState,
  isTyping,
  isValid: _isValid,
  onBeforeCreate,
  onValidate,
}) => {
  const { t } = useTranslation();

  const {
    profile,
    selectedWorkspace,
    setChats,
    setPresets,
    setPrompts,
    setFiles,
    setCollections,
    setAssistants,
    setGroupAssistants,
    setAssistantImages,
    setGroupAssistantImages,
    setTools,
    setModels,
    chatSettings,
  } = useContext(ChatbotUIContext);

  const buttonRef = useRef<HTMLButtonElement>(null);

  const [creating, setCreating] = useState(false);
  const { name, content, group_id: azureGroupId } = createState || {};

  const isCreateDisabled =
    (contentType === "prompts" && (!name || !content)) ||
    (contentType === "assistants" && !name) ||
    (contentType === "collections" && !name) ||
    (contentType === "presets" && !name) ||
    (contentType === "group-assistants" && !name);

  const createFunctions = {
    chats: createChat,
    presets: createPreset,
    prompts: createPrompt,
    files: async (
      createState: { file: File } & TablesInsert<"files">,
      workspaceId: string,
      processedFile?: File,
    ) => {
      if (!selectedWorkspace || !profile) return;

      const { file, ...rest } = createState;

      // Check if file already exists in database
      const existingFile = await checkFileExistence(file.name, profile.user_id);

      if (existingFile) {
        // File exists, check if it's already in the current workspace
        const isInWorkspace = await checkFileInWorkspace(
          existingFile.id,
          workspaceId,
        );

        if (!isInWorkspace) {
          // Add the existing file to the current workspace
          await createFileWorkspace({
            user_id: profile.user_id,
            file_id: existingFile.id,
            workspace_id: workspaceId,
          });

          return existingFile;
        } else {
          // File is already in this workspace
          throw new Error(t("file_already_uploaded"));
        }
      }

      // File doesn't exist, create it
      const createdFile = await createFileBasedOnExtension(
        file,
        rest,
        workspaceId,
        selectedWorkspace.embeddings_provider as "openai" | "local",
        chatSettings,
        processedFile,
      );

      return createdFile;
    },
    collections: async (
      createState: {
        image: File;
        collectionFiles: TablesInsert<"collection_files">[];
      } & Tables<"collections">,
      workspaceId: string,
    ) => {
      const { collectionFiles, ...rest } = createState;

      const createdCollection = await createCollection(rest, workspaceId);

      const finalCollectionFiles = collectionFiles.map(collectionFile => ({
        ...collectionFile,
        collection_id: createdCollection.id,
      }));

      await createCollectionFiles(finalCollectionFiles);

      return createdCollection;
    },

    assistants: async (
      createState: {
        image: File;
        files: Tables<"files">[];
        collections: Tables<"collections">[];
        tools: Tables<"tools">[];
        signatureReferenceImage?: File | null;
        signaturePersonName?: string | null;
        signatureCompanyName?: string | null;
      } & Tables<"assistants">,
      workspaceId: string,
    ) => {
      const {
        image,
        files,
        collections,
        tools,
        signatureReferenceImage,
        signaturePersonName,
        signatureCompanyName,
        ...rest
      } = createState;

      const createdAssistant = await createAssistant(rest, workspaceId);

      let updatedAssistant = createdAssistant;

      if (image) {
        const filePath = await uploadAssistantImage(createdAssistant, image);

        updatedAssistant = await updateAssistant(createdAssistant.id, {
          image_path: filePath,
        });

        const url = (await getAssistantImageFromStorage(filePath)) || "";

        if (url) {
          const response = await fetch(url);
          const blob = await response.blob();
          const base64 = await convertBlobToBase64(blob);

          setAssistantImages(prev => [
            ...prev,
            {
              assistantId: updatedAssistant.id,
              path: filePath,
              base64,
              url,
            },
          ]);
        }
      }

      // Handle signature reference image upload for signature-assistant
      let signatureFileIds: string[] = [];
      if (signatureReferenceImage && rest.role === "signature-assistant") {
        try {
          const { uploadFile } = await import("@/db/storage/files");
          const filePath = await uploadFile(signatureReferenceImage, {
            name: signatureReferenceImage.name,
            user_id: rest.user_id,
            file_id: `signature_ref_${Date.now()}`,
          });

          const { supabase } = await import("@/lib/supabase/browser-client");
          const { createFileWorkspace } = await import("@/db/files");

          const { data: createdFile, error: insertError } = await supabase
            .from("files")
            .insert([
              {
                user_id: rest.user_id,
                name: signatureReferenceImage.name,
                description: JSON.stringify({
                  type: "signature_reference",
                  personName: signaturePersonName || "",
                  companyName: signatureCompanyName || "",
                }),
                file_path: filePath,
                size: signatureReferenceImage.size,
                type: signatureReferenceImage.type || "image/png",
                tokens: 0,
                sharing: "private",
              },
            ])
            .select("*")
            .single();

          if (insertError) throw insertError;

          await createFileWorkspace({
            user_id: rest.user_id,
            file_id: createdFile.id,
            workspace_id: workspaceId,
          });

          signatureFileIds.push(createdFile.id);
        } catch (error) {
          logger.error(
            "[Signature Assistant] Failed to upload reference signature",
            error,
          );
        }
      }

      const assistantFiles = [
        ...files.map(file => ({
          user_id: rest.user_id,
          assistant_id: createdAssistant.id,
          file_id: file.id,
        })),
        ...signatureFileIds.map(fileId => ({
          user_id: rest.user_id,
          assistant_id: createdAssistant.id,
          file_id: fileId,
        })),
      ];

      const assistantCollections = collections.map(collection => ({
        user_id: rest.user_id,
        assistant_id: createdAssistant.id,
        collection_id: collection.id,
      }));

      const assistantTools = tools.map(tool => ({
        user_id: rest.user_id,
        assistant_id: createdAssistant.id,
        tool_id: tool.id,
      }));

      if (assistantFiles.length > 0) {
        await createAssistantFiles(assistantFiles);
      }
      await createAssistantCollections(assistantCollections);
      await createAssistantTools(assistantTools);

      return updatedAssistant;
    },

    "group-assistants": async (
      createState: {
        image: File;
        files: Tables<"files">[];
        collections: Tables<"collections">[];
        tools: Tables<"tools">[];
      } & Tables<"assistants">,
      workspaceId: string,
    ) => {
      const { image, files, collections, tools, ...rest } = createState;

      const createdAssistant = await createAssistant(rest, workspaceId);

      let updatedAssistant = createdAssistant;

      if (image) {
        const filePath = await uploadAssistantImage(createdAssistant, image);

        updatedAssistant = await updateAssistant(createdAssistant.id, {
          image_path: filePath,
        });

        const url = (await getAssistantImageFromStorage(filePath)) || "";

        if (url) {
          const response = await fetch(url);
          const blob = await response.blob();
          const base64 = await convertBlobToBase64(blob);

          setGroupAssistantImages(prev => [
            ...prev,
            {
              assistantId: updatedAssistant.id,
              path: filePath,
              base64,
              url,
            },
          ]);
        }
      }

      const assistantFiles = files.map(file => ({
        user_id: rest.user_id,
        assistant_id: createdAssistant.id,
        file_id: file.id,
      }));

      const assistantCollections = collections.map(collection => ({
        user_id: rest.user_id,
        assistant_id: createdAssistant.id,
        collection_id: collection.id,
      }));

      const assistantTools = tools.map(tool => ({
        user_id: rest.user_id,
        assistant_id: createdAssistant.id,
        tool_id: tool.id,
      }));

      await createAssistantFiles(assistantFiles);
      await createAssistantCollections(assistantCollections);
      await createAssistantTools(assistantTools);

      return updatedAssistant;
    },

    tools: createTool,
    models: createModel,
  };
  const stateUpdateFunctions = {
    chats: setChats,
    presets: setPresets,
    prompts: setPrompts,
    files: setFiles,
    collections: setCollections,
    assistants: setAssistants,
    "group-assistants": setGroupAssistants,
    tools: setTools,
    models: setModels,
  };

  const handleCreate = async () => {
    try {
      if (isTyping) {
        return;
      }

      if (onValidate && !onValidate()) {
        return;
      }

      const createFunction = createFunctions[contentType];
      const setStateFunction = stateUpdateFunctions[contentType];

      if (!createFunction || !setStateFunction) {
        return;
      }

      setCreating(true);
      logger.info("Creating item", { contentType, state: createState });

      let newItem;
      if (!selectedWorkspace) {
        return;
      }
      if (contentType === "group-assistants" && !azureGroupId) {
        toast.error("To create new assistant please select a group");
        setCreating(false);
        return;
      }

      let processedFile = null;
      if (onBeforeCreate) {
        try {
          processedFile = await onBeforeCreate();
        } catch (error: unknown) {
          const err = error instanceof Error ? error : new Error(String(error));
          toast.error(err.message || "Failed to process file");
          setCreating(false);
          return;
        }
      }

      newItem = await createFunction(
        createState,
        selectedWorkspace.id,
        processedFile,
      );

      setStateFunction((prevItems: any) => [...prevItems, newItem]);

      if (contentType === "files") {
        const fileData = await getFileWorkspacesByWorkspaceId(
          selectedWorkspace.id,
        );
        setFiles(fileData.files || []);
      }
      const successMessage = t("{{contentType}} created successfully", {
        contentType: contentType.replace("_", " "),
      });
      logger.success("Item created", { contentType, id: newItem?.id });
      toast.success(successMessage);

      onOpenChange(false);
      setCreating(false);
    } catch (error) {
      logger.error("Error creating item", {
        contentType,
        error: error instanceof Error ? error.message : String(error),
      });
      toast.error(
        t("Error creating {{contentType}}. {{error}}", {
          contentType: contentType.replace("_", " "),
          error: error,
        }),
      );

      setCreating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!isTyping && e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      buttonRef.current?.click();
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent
        className="flex min-w-[300px] flex-col justify-between overflow-auto sm:min-w-[400px]"
        side="left"
        onKeyDown={handleKeyDown}
      >
        <div className="grow overflow-auto">
          <SheetHeader>
            <SheetTitle className="text-2xl font-bold">
              {t(
                contentType.charAt(0).toUpperCase() + contentType.slice(1, -1),
              )}{" "}
              {t("Create")}
            </SheetTitle>
          </SheetHeader>

          <div className="mt-4 space-y-3">{renderInputs()}</div>
        </div>

        <SheetFooter className="mt-2 flex justify-between">
          <div className="flex grow justify-end space-x-2">
            <Button
              disabled={creating}
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {t("Cancel")}
            </Button>

            <Button
              className="capitalize"
              disabled={creating || isCreateDisabled}
              ref={buttonRef}
              onClick={handleCreate}
            >
              {creating ? t("Creating...") : t("Create")}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};
