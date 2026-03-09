"use client";

import { createClientLogger } from "@/lib/logger/client";
import { useChatHandler } from "@/components/chat/chat-hooks/use-chat-handler";
import { ChatbotUIContext } from "@/context/context";
import { Tables } from "@/supabase/types";
import { FC, useContext, useEffect, useState, useMemo } from "react";
import { Message } from "../messages/message";
import { createClient } from "@/lib/supabase/client";
import { getProfiles, getChatGroupId } from "@/db/profile";
import { getSession } from "next-auth/react";

const logger = createClientLogger({ component: "ChatMessages" });

interface ChatMessagesProps {}

export const ChatMessages: FC<ChatMessagesProps> = ({}) => {
  const { chatMessages, chatFileItems, selectedChat } =
    useContext(ChatbotUIContext);

  const { handleSendEdit } = useChatHandler();

  const [editingMessage, setEditingMessage] = useState<Tables<"messages">>();
  const [piiTokenMap, setPiiTokenMap] = useState<Record<string, string>>({});

  // Lift profile data fetching to parent to avoid N+1 queries in Message components
  const [profileImages, setProfileImages] = useState<
    { id: string; base64: string }[]
  >([]);
  const [isGroupChat, setIsGroupChat] = useState(false);
  const [currentUserName, setCurrentUserName] = useState<string | null>(null);

  // Fetch profiles and group chat status once for all messages
  useEffect(() => {
    const fetchProfileData = async () => {
      try {
        const [profiles, azureUserSession] = await Promise.all([
          getProfiles(),
          getSession(),
        ]);

        setCurrentUserName(azureUserSession?.user?.name || null);
        setProfileImages(
          profiles.map(profile => ({
            id: profile.user_id,
            base64: profile.profile_image,
          })),
        );

        // Check if current chat is a group chat
        if (selectedChat?.id) {
          const isGroup = await getChatGroupId(selectedChat.id);
          setIsGroupChat(isGroup);
        }
      } catch (error) {
        logger.error("Error fetching profile data", { error: String(error) });
      }
    };

    fetchProfileData();
  }, [selectedChat?.id]);

  useEffect(() => {
    const loadAndMergePIITokenMaps = async () => {
      const supabase = createClient();
      const tokenMaps: Record<string, any> = {};

      if (chatFileItems.length > 0) {
        const fileItemIds = chatFileItems.map(item => item.id);

        try {
          const { data, error } = await supabase
            .from("file_items")
            .select("id, pii_token_map")
            .in("id", fileItemIds);

          if (error) {
            logger.error("Error loading file item token maps", {
              error: String(error),
            });
          } else {
            data?.forEach(item => {
              if (item.pii_token_map) {
                tokenMaps[item.id] = item.pii_token_map;
              }
            });
          }
        } catch (err) {
          logger.error("Error fetching file item token maps", {
            error: String(err),
          });
        }
      }

      const mergedTokenMap: Record<string, string> = {};

      // From chat messages
      chatMessages.forEach(chatMessage => {
        const msg = chatMessage.message as any;
        if (msg.pii_token_map) {
          try {
            const tokenMap =
              typeof msg.pii_token_map === "string"
                ? JSON.parse(msg.pii_token_map)
                : msg.pii_token_map;
            Object.assign(mergedTokenMap, tokenMap);
          } catch (e) {
            logger.error("Error parsing message token map", {
              error: String(e),
            });
          }
        }
      });

      // From file items
      chatFileItems.forEach(fileItem => {
        const tokenMapData = tokenMaps[fileItem.id];
        if (tokenMapData) {
          try {
            const tokenMap =
              typeof tokenMapData === "string"
                ? JSON.parse(tokenMapData)
                : tokenMapData;
            Object.assign(mergedTokenMap, tokenMap);
          } catch (e) {
            logger.error("Error parsing file item token map", {
              error: String(e),
            });
          }
        }
      });

      setPiiTokenMap(mergedTokenMap);
    };

    loadAndMergePIITokenMaps();
  }, [chatMessages.length, chatFileItems]);

  // Memoize sorted messages and file items lookup for better performance
  const sortedMessages = useMemo(
    () =>
      [...chatMessages].sort(
        (a, b) => a.message.sequence_number - b.message.sequence_number,
      ),
    [chatMessages],
  );

  // Create a Map for O(1) lookup of file item IDs instead of O(n) filter
  const fileItemsById = useMemo(() => {
    const map = new Map<string, Tables<"file_items">>();
    chatFileItems.forEach(item => {
      if (!map.has(item.id)) {
        map.set(item.id, item);
      }
    });
    return map;
  }, [chatFileItems]);

  return sortedMessages.map((chatMessage, index, array) => {
    // Use the memoized map for O(1) lookup instead of O(n) filter
    const messageFileItems = chatMessage.fileItems
      .map(id => fileItemsById.get(id))
      .filter((item): item is Tables<"file_items"> => item !== undefined);

    return (
      <Message
        key={chatMessage.message.sequence_number}
        message={chatMessage.message}
        index={index}
        fileItems={messageFileItems}
        isEditing={editingMessage?.id === chatMessage.message.id}
        isLast={index === array.length - 1}
        onStartEdit={setEditingMessage}
        onCancelEdit={() => setEditingMessage(undefined)}
        onSubmitEdit={handleSendEdit}
        metadata={chatMessage.metadata}
        piiTokenMap={piiTokenMap}
        profileImages={profileImages}
        isGroupChat={isGroupChat}
        currentUserName={currentUserName}
      />
    );
  });
};
