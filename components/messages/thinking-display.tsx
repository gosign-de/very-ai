"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { MessageMarkdownMemoized } from "./message-markdown-memoized";
import { MessageCodeBlock } from "./message-codeblock";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import React from "react";

interface ThinkingDisplayProps {
  thinkingContent: string;
  isVisible: boolean;
  isStreaming?: boolean;
}

export const ThinkingDisplay: React.FC<ThinkingDisplayProps> = ({
  thinkingContent,
  isVisible,
  isStreaming = false,
}) => {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);

  // Clean up thinking content to handle \n\n issues
  const cleanThinkingContent = (content: string): string => {
    if (!content) return "";

    return (
      content
        // Fix escaped newlines that appear as literal \n\n in the text
        .replace(/\\n\\n/g, "\n\n")
        .replace(/\\n/g, "\n")
        // Fix cases where \\n\\n appears as literal text
        .replace(/\\\\n\\\\n/g, "\n\n")
        .replace(/\\\\n/g, "\n")
        // Replace multiple consecutive newlines with double newlines for proper markdown
        .replace(/\n{3,}/g, "\n\n")
        // Clean up any remaining artifacts
        .replace(/\n\n\n+/g, "\n\n")
        .trim()
    );
  };

  // Keep collapsed by default - user must click to expand
  // useEffect(() => {
  //   if (thinkingContent && thinkingContent.trim().length > 0) {
  //     setIsExpanded(true);
  //   }
  // }, [thinkingContent]);

  if (!isVisible) return null;
  if (!isStreaming && (!thinkingContent || thinkingContent.trim().length === 0))
    return null;
  if (isStreaming && (!thinkingContent || thinkingContent.trim().length === 0))
    return null;

  return (
    <div className="mb-4">
      <div className="flex items-start">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-1 rounded border border-[#e5e5e5] bg-white px-3 py-1 text-xs text-[#3b3b3b] shadow dark:border-[#3a3a3a] dark:bg-[#494949] dark:text-[#d5d5d5]"
          style={{ minWidth: 0 }}
        >
          <span className="text-xs">{t("Thinking")}</span>
          {isStreaming && <span className="ml-1 animate-pulse">...</span>}
          <svg
            className={`ml-1 size-3 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </button>
      </div>
      {isExpanded && (
        <div className="mt-2 flex">
          <div className="border-l-2 border-gray-300 pl-4 dark:border-gray-600">
            {thinkingContent ? (
              <MessageMarkdownMemoized
                className="prose dark:prose-invert prose-p:leading-relaxed prose-pre:p-0 prose-p:my-2 prose-strong:font-semibold min-w-full break-words text-sm text-gray-600 dark:text-gray-300"
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[rehypeRaw, rehypeSanitize]}
                components={{
                  p({ children }) {
                    return (
                      <div className="my-2 first:mt-0 last:mb-0">
                        {children}
                      </div>
                    );
                  },
                  code({ className, children, ...props }) {
                    const childArray = React.Children.toArray(children);
                    const firstChild = childArray[0];
                    const firstChildAsString = React.isValidElement(firstChild)
                      ? (firstChild.props as { children?: React.ReactNode })
                          .children
                      : firstChild;

                    if (firstChildAsString === "▍") {
                      return (
                        <span className="mt-1 animate-pulse cursor-default">
                          ▍
                        </span>
                      );
                    }

                    const match = /language-(\w+)/.exec(className || "");

                    // Check if this is a multi-line code block (has language class)
                    if (match) {
                      // Extract only the actual code content, handling nested elements properly
                      const extractText = (child: any): string => {
                        if (typeof child === "string") {
                          return child;
                        }
                        if (
                          React.isValidElement(child) &&
                          child.props &&
                          typeof child.props === "object" &&
                          "children" in child.props
                        ) {
                          const children = (child.props as any).children;
                          if (Array.isArray(children)) {
                            return children.map(extractText).join("");
                          }
                          return extractText(children);
                        }
                        return "";
                      };

                      const codeContent = childArray
                        .map(extractText)
                        .join("")
                        .replace(/\n$/, "");

                      return (
                        <MessageCodeBlock
                          key={Math.random()}
                          language={match[1] || ""}
                          value={codeContent}
                          {...props}
                        />
                      );
                    }

                    // For inline code, render as normal inline code
                    return (
                      <code
                        className="rounded-md bg-[#e8e8e8] px-2 py-0.5 font-mono text-[13px] text-[#2c2c2c] dark:bg-[#2a2a2a] dark:text-[#e0e0e0]"
                        {...props}
                      >
                        {children}
                      </code>
                    );
                  },
                  a({ href, children }) {
                    return (
                      <a
                        href={href}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[#3b99f3] hover:text-[#4e9bf7c7]"
                      >
                        {children}
                      </a>
                    );
                  },
                }}
              >
                {cleanThinkingContent(thinkingContent)}
              </MessageMarkdownMemoized>
            ) : (
              <div className="text-sm text-gray-600 dark:text-gray-300">
                {isStreaming
                  ? t("Processing your request...")
                  : t("No thinking content available")}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
