"use client";
import { createClientLogger } from "@/lib/logger/client";

import { ChatHelp } from "@/components/chat/chat-help";

const logger = createClientLogger({ component: "ChatPage" });
import { useChatHandler } from "@/components/chat/chat-hooks/use-chat-handler";
import { useSelectFileHandler } from "@/components/chat/chat-hooks/use-select-file-handler";
import { ChatInput } from "@/components/chat/chat-input";
import { ChatSettings } from "@/components/chat/chat-settings";
import { ChatUI } from "@/components/chat/chat-ui";
import { QuickSettings } from "@/components/chat/quick-settings";
import { Brand } from "@/components/ui/brand";
import { ChatbotUIContext } from "@/context/context";
import useHotkey from "@/lib/hooks/use-hotkey";
import { IconMessageCircle, IconUpload } from "@tabler/icons-react";
import { useTheme } from "next-themes";
import { useContext, useEffect, useState } from "react";
import { useDropzone } from "react-dropzone";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import TemporaryChatModal from "@/components/chat/temporary-chat";
import { supabase } from "@/lib/supabase/browser-client";

export default function ChatPage() {
  useHotkey("o", () => handleNewChat());
  useHotkey("l", () => {
    handleFocusChatInput();
  });

  const [acceptedFile, setAcceptedFile] = useState(null);
  const { filesToAccept } = useSelectFileHandler();
  const {
    chatMessages,
    chatSettings,
    setChatSettings,
    availableHostedModels,
    availableLocalModels,
    availableOpenRouterModels,
    assistantDirectModeWebhook: _assistantDirectModeWebhook,
  } = useContext(ChatbotUIContext);
  const { handleNewChat, handleFocusChatInput } = useChatHandler();
  const { theme } = useTheme();
  const { t } = useTranslation();
  const [showModal, setShowModal] = useState(false);
  const [hasSeenPopup, setHasSeenPopup] = useState(false);
  const isTempChat = chatSettings?.is_temp_chat || false;
  const noModelsAvailable =
    availableHostedModels.length === 0 &&
    availableLocalModels.length === 0 &&
    availableOpenRouterModels.length === 0;

  useEffect(() => {
    const fetchUserProfile = async () => {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !data.session?.user) {
        logger.error("Error fetching user session", {
          error: String(sessionError),
        });
        return;
      }

      const userId = data.session.user.id;

      const { data: profile, error } = await supabase
        .from("profiles")
        .select("is_tempchat_popup")
        .eq("user_id", userId)
        .single();

      if (error || !profile) {
        if (error) {
          logger.error("Error fetching profile", { error: String(error) });
        }
        return;
      }

      setHasSeenPopup(
        (profile as { is_tempchat_popup: boolean | null }).is_tempchat_popup ??
          false,
      );
    };

    fetchUserProfile();
  }, []);

  const handleToggleTemporary = async (checked: boolean) => {
    if (checked && !isTempChat) {
      if (!hasSeenPopup) {
        setShowModal(true);
      } else {
        updateTemporaryChat(true);
      }
    } else {
      updateTemporaryChat(checked);
    }
  };

  const confirmTemporaryChat = async () => {
    await updateDatabasePopupFlag();
    setHasSeenPopup(true);
    updateTemporaryChat(true);
    setShowModal(false);
  };

  const updateTemporaryChat = (value: boolean) => {
    setChatSettings(prev => ({
      ...prev,
      is_temp_chat: value,
    }));
  };

  const updateDatabasePopupFlag = async () => {
    const { data, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !data.session?.user) return;

    const userId = data.session.user.id;

    const { error } = await supabase
      .from("profiles")
      .update({ is_tempchat_popup: true })
      .eq("user_id", userId);

    if (error) {
      logger.error("Error updating profile", { error: String(error) });
    }
  };

  const onDrop = (acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setAcceptedFile(acceptedFiles as any);
    } else {
      toast.error(t("Failed to upload file"));
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    noClick: true,
  });

  return (
    <div
      {...getRootProps()}
      className="relative flex size-full flex-col items-center"
    >
      <input {...getInputProps()} accept={filesToAccept} type="file" multiple />

      {noModelsAvailable && (
        <div className="bg-primary/10 text-primary w-full px-4 py-2 text-center text-sm">
          {t("Running in demo mode – API keys will be provided in ENV.")}
        </div>
      )}

      {isDragActive && (
        <div className="bg-background/70 absolute inset-0 z-10 flex items-center justify-center bg-opacity-50 backdrop-blur-sm">
          <div className="flex flex-col items-center space-y-4 rounded-lg p-6 opacity-100 shadow-lg">
            <IconUpload className="size-12" />
            <div className="text-ellipsis text-center font-semibold tracking-wide">
              {t("Drag and Drop the file here...")}
            </div>
          </div>
        </div>
      )}

      {chatMessages.length === 0 ? (
        <div className="relative flex size-full flex-col items-center justify-center">
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <Brand theme={theme === "dark" ? "dark" : "light"} />
          </div>

          <div className="absolute left-2 top-2">
            <QuickSettings />
          </div>

          <div className="absolute right-2 top-2 flex items-center space-x-3">
            <div className="border-input bg-background text-secondary-foreground flex items-center space-x-2 rounded-full border-2 p-2">
              <IconMessageCircle className="text-secondary-foreground size-5" />
              <label className="text-sm">{t("Temporary Chat")}</label>
              <Switch
                checked={isTempChat}
                onCheckedChange={handleToggleTemporary}
                className="data-[state=checked]:bg-primary data-[state=unchecked]:bg-muted border-input scale-100 border-2 shadow-md transition-all duration-200"
              />
            </div>
            <ChatSettings />
          </div>

          <TemporaryChatModal
            isOpen={showModal}
            onClose={() => setShowModal(false)}
            onConfirm={confirmTemporaryChat}
          />

          <div className="flex grow flex-col items-center justify-center" />

          <div className="relative w-full min-w-[300px] items-end px-2 pb-3 pt-0 sm:w-[550px] sm:pb-8 sm:pt-5 lg:w-[650px] xl:w-[700px]">
            <ChatInput
              acceptedFile={acceptedFile}
              setAcceptedFile={setAcceptedFile}
            />
            {isTempChat && (
              <p className="text-muted-foreground mt-2 text-center text-xs">
                {t(
                  "Temporary chat will disappear when you reload or close this window. You won’t be able to view it again later.",
                )}
              </p>
            )}
          </div>

          <div className="absolute bottom-2 right-2 hidden md:block lg:bottom-4 lg:right-4">
            <ChatHelp />
          </div>
        </div>
      ) : (
        <ChatUI />
      )}
    </div>
  );
}
