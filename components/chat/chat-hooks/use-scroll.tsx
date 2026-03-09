import { ChatbotUIContext } from "@/context/context";
import {
  type UIEventHandler,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

export const useScroll = () => {
  const { isGenerating, chatMessages } = useContext(ChatbotUIContext);

  const messagesStartRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isAutoScrolling = useRef(false);
  const previousMessageCount = useRef(chatMessages.length);
  const lastMessageContentLength = useRef(0);
  const wasGeneratingRef = useRef(false);

  const [isAtTop, setIsAtTop] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [userScrolled, setUserScrolled] = useState(false);
  const [isOverflowing, setIsOverflowing] = useState(false);

  const scrollToTop = useCallback(() => {
    if (messagesStartRef.current) {
      messagesStartRef.current.scrollIntoView({ behavior: "instant" });
    }
  }, []);

  const scrollToBottom = useCallback(() => {
    isAutoScrolling.current = true;

    setTimeout(() => {
      if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior: "instant" });
      }

      isAutoScrolling.current = false;
    }, 100);
  }, []);

  useEffect(() => {
    setUserScrolled(false);

    if (!isGenerating && userScrolled) {
      setUserScrolled(false);
    }

    // Track when generation starts/stops
    wasGeneratingRef.current = isGenerating;
  }, [isGenerating, userScrolled]);

  useEffect(() => {
    const currentMessageCount = chatMessages.length;
    const lastMessage = chatMessages[chatMessages.length - 1];
    const currentContentLength = lastMessage?.message?.content?.length || 0;

    // Check if this is a new message (count increased)
    const isNewMessage = currentMessageCount > previousMessageCount.current;

    // Check if content is being streamed (gradual increase in content length)
    const isStreaming =
      currentContentLength > lastMessageContentLength.current &&
      currentContentLength - lastMessageContentLength.current < 500; // Threshold for streaming chunks

    // Check if content appeared all at once (large increase in content length)
    const isInstantResponse =
      currentContentLength > lastMessageContentLength.current &&
      currentContentLength - lastMessageContentLength.current >= 500;

    const hasThinkingSteps = lastMessage?.message?.pin_metadata
      ? (() => {
          try {
            const metadata = JSON.parse(lastMessage.message.pin_metadata);
            return metadata.n8n_direct_mode && !metadata.completed;
          } catch {
            return false;
          }
        })()
      : false;
    // Only auto-scroll in these cases:
    // 1. New message was added and user is at bottom
    // 2. Content is being streamed and user hasn't scrolled
    // 3. User is generating and at bottom (for initial response)
    if (isGenerating && !userScrolled) {
      if (isNewMessage && isAtBottom) {
        scrollToBottom();
      } else if (isStreaming && isAtBottom) {
        scrollToBottom();
      } else if (wasGeneratingRef.current && isAtBottom && !isInstantResponse) {
        scrollToBottom();
      }
    }

    if (hasThinkingSteps && isAtBottom && !userScrolled) {
      scrollToBottom();
    }

    // Update refs for next comparison
    previousMessageCount.current = currentMessageCount;
    lastMessageContentLength.current = currentContentLength;
  }, [chatMessages, isGenerating, userScrolled, isAtBottom, scrollToBottom]);

  const handleScroll: UIEventHandler<HTMLDivElement> = useCallback(e => {
    const target = e.target as HTMLDivElement;
    const bottom =
      Math.round(target.scrollHeight) - Math.round(target.scrollTop) ===
      Math.round(target.clientHeight);
    setIsAtBottom(bottom);

    const top = target.scrollTop === 0;
    setIsAtTop(top);

    if (!bottom && !isAutoScrolling.current) {
      setUserScrolled(true);
    } else {
      setUserScrolled(false);
    }

    const isOverflow = target.scrollHeight > target.clientHeight;
    setIsOverflowing(isOverflow);
  }, []);

  return {
    messagesStartRef,
    messagesEndRef,
    isAtTop,
    isAtBottom,
    userScrolled,
    isOverflowing,
    handleScroll,
    scrollToTop,
    scrollToBottom,
    setIsAtBottom,
  };
};
