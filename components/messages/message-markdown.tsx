"use client";

import React, { FC, useState, useMemo, useContext } from "react";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import { MessageCodeBlock } from "./message-codeblock";
import { MessageMarkdownMemoized } from "./message-markdown-memoized";
import ImageLoader from "./ImageLoader";
import { ChatbotUIContext } from "@/context/context";
import ToolInUse from "./ToolInUse";

interface MessageMarkdownProps {
  content: string;
  role: string;
  isLast: boolean;
}

export const MessageMarkdown: FC<MessageMarkdownProps> = ({
  content,
  role,
  isLast,
}) => {
  const { toolInUse, setToolInUse: _setToolInUse } =
    useContext(ChatbotUIContext);

  const [isImage, _setIsImage] = useState(false);
  const [_isWebSearch, setIsWebSearch] = useState(false);
  const [_webSearchUpdate, setWebSearchUpdate] = useState<string>("");

  const cleanedContent = useMemo(() => {
    let result = content;

    const pdfContentPattern = /<<pdfContentStart>>.*?<<pdfContentEnd>>/s;
    result = result.replace(pdfContentPattern, "").trim();

    const imageUrlPattern = /<<imageUrlStart>>(.*?)<<imageUrlEnd>>/s;
    result = result.replace(imageUrlPattern, "$1").trim();

    if (result.startsWith("save_memory:")) {
      result = result.replace(/^save_memory:\s*/, "").trim();
    } else if (content.startsWith("websearch:")) {
      setWebSearchUpdate("webSearchContent");
      setIsWebSearch(true);
      result = result.replace(/^websearch:\s*/, "").trim();
    }

    return result;
  }, [content]);

  return (
    <>
      {/* Conditionally render the image or video loader */}
      {isImage ? (
        <div>
          {/* <ImageLoader imageUrl={content.replace(/^image:/, "")} /> */}
        </div>
      ) : (
        <MessageMarkdownMemoized
          className="prose dark:prose-invert prose-p:leading-relaxed prose-pre:p-0 min-w-full space-y-6 break-words"
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[rehypeRaw, rehypeSanitize]}
          components={{
            p({ children }) {
              return <div className="mb-2 last:mb-0">{children}</div>;
            },
            img({ node: _node, ...props }) {
              return <ImageLoader imageUrl={props.src} />;
            },
            code({ node: _node, className, children, ...props }) {
              const childArray = React.Children.toArray(children);
              const firstChild = childArray[0];
              const firstChildAsString = React.isValidElement(firstChild)
                ? (firstChild.props as { children?: React.ReactNode }).children
                : firstChild;

              if (firstChildAsString === "▍") {
                return (
                  <span className="mt-1 animate-pulse cursor-default">▍</span>
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
          {cleanedContent}
        </MessageMarkdownMemoized>
      )}
      {toolInUse && <ToolInUse role={role} isLast={isLast} />}
    </>
  );
};

export default MessageMarkdown;
