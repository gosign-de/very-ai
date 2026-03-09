"use client";

import { createClientLogger } from "@/lib/logger/client";

import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { IconGitFork } from "@tabler/icons-react";
import { FC, useContext, useRef, useState } from "react";
import { ChatbotUIContext } from "@/context/context";
import { Tables } from "@/supabase/types";
import { useTranslation } from "react-i18next";
import { supabase } from "@/lib/supabase/browser-client";

const logger = createClientLogger({ component: "ForkChat" });

interface ForkChatProps {
  chat: Tables<"chats">;
}

export const ForkChat: FC<ForkChatProps> = ({ chat }) => {
  const { t } = useTranslation();
  const { setChats, setSelectedChat } = useContext(ChatbotUIContext);

  const buttonRef = useRef<HTMLButtonElement>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [forkName, setForkName] = useState(`${chat.name} - Fork`);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter") {
      buttonRef.current?.click();
    }
  };

  const handleFork = async () => {
    const {
      id: originalChatId,
      created_at: _created_at,
      updated_at: _updated_at,
      ...rest
    } = chat;

    const newChatData = {
      ...rest,
      name: forkName,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data: newChat, error: chatError } = await supabase
      .from("chats")
      .insert(newChatData)
      .select()
      .single();

    if (chatError || !newChat) {
      logger.error("Fork failed", { error: String(chatError?.message) });
      return;
    }

    const { data: originalMessages, error: fetchError } = await supabase
      .from("messages")
      .select("*")
      .eq("chat_id", originalChatId);

    if (fetchError) {
      logger.error("Failed to fetch original messages", {
        error: String(fetchError.message),
      });
    }

    if (originalMessages && originalMessages.length > 0) {
      const newMessages = originalMessages.map(
        ({
          id: _id,
          created_at: _created_at,
          updated_at: _updated_at,
          chat_id: _chat_id,
          ...msg
        }) => ({
          ...msg,
          chat_id: newChat.id,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }),
      );

      const { error: insertError } = await supabase
        .from("messages")
        .insert(newMessages);

      if (insertError) {
        logger.error("Failed to insert cloned messages", {
          error: String(insertError.message),
        });
      }
    }

    setChats(prev => [newChat, ...prev]);
    setSelectedChat(newChat);
    setShowDialog(false);
  };

  return (
    <Dialog open={showDialog} onOpenChange={setShowDialog}>
      <DialogTrigger asChild>
        <div className="mt-1 cursor-pointer hover:opacity-50">
          <IconGitFork size={24} />
        </div>
      </DialogTrigger>

      <DialogContent onKeyDown={handleKeyDown}>
        <DialogHeader>
          <DialogTitle>{t("Fork Chat")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-1">
          <label className="text-sm font-medium">{t("Chat Name")}</label>
          <Input value={forkName} onChange={e => setForkName(e.target.value)} />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setShowDialog(false)}>
            {t("Cancel")}
          </Button>
          <Button ref={buttonRef} onClick={handleFork}>
            {t("Create Fork")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
