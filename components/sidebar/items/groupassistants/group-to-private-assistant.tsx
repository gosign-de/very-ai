import { Tables } from "@/supabase/types";
import { toast } from "sonner";
import { createAssistant, updateAssistant } from "@/db/assistants";
import { useContext } from "react";
import { ChatbotUIContext } from "@/context/context";
import {
  copyAssistantImage,
  getAssistantImageFromStorage,
} from "@/db/storage/assistant-images";
import { convertBlobToBase64 } from "@/lib/blob-to-b64";

export const useGroupToPrivateAssistantHandler = () => {
  const { profile, selectedWorkspace, setAssistants, setAssistantImages } =
    useContext(ChatbotUIContext);
  if (!selectedWorkspace) {
    return;
  }

  const groupToPrivateAssistant = async (assistant: Tables<"assistants">) => {
    const newAssistant: Omit<Tables<"assistants">, "id"> = {
      user_id: profile.user_id,
      group_id: null,
      name: assistant.name,
      description: assistant.description,
      image_path: "",
      model: assistant.model,
      image_model: assistant.image_model,
      prompt: assistant.prompt,
      temperature: assistant.temperature,
      role: assistant.role,
      include_profile_context: assistant.include_profile_context,
      include_workspace_instructions: assistant.include_workspace_instructions,
      context_length: assistant.context_length,
      created_at: new Date().toISOString(),
      embeddings_provider: assistant.embeddings_provider,
      updated_at: null,
      folder_id: null,
      sharing: assistant.sharing,
      is_confidential: assistant.is_confidential ?? false,
      author: assistant.author, // or another appropriate value for author
    };

    try {
      const createdAssistant = await createAssistant(
        newAssistant,
        selectedWorkspace.id,
      );

      let updatedAssistant = createdAssistant;

      if (assistant.image_path) {
        const filePath = await copyAssistantImage(
          createdAssistant,
          assistant.image_path,
        );
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

      setAssistants(prevAssistants => [...prevAssistants, updatedAssistant]);
      toast.success("Private assistant created successfully");
      return createdAssistant;
    } catch (error) {
      toast.error("Error creating private assistant", error);
      return false;
    }
  };

  return { groupToPrivateAssistant };
};
