import { FC } from "react";
import Image from "next/image";

interface ChatbotUISVGProps {
  theme: "dark" | "light";
  scale?: number;
  compact?: boolean;
}

export const ChatbotUISVG: FC<ChatbotUISVGProps> = ({
  theme: _theme,
  compact = false,
}) => {
  const imgSize = compact ? 80 : 250;
  const textSize = compact ? "text-xl" : "text-4xl";
  const gap = compact ? "gap-2" : "gap-4";

  return (
    <div className={`flex flex-col items-center ${gap}`}>
      <Image
        src="/logo.jpeg"
        alt="Very AI"
        width={imgSize}
        height={imgSize}
        priority
      />
      <h1 className={`text-foreground whitespace-nowrap ${textSize} font-bold`}>
        Very AI
      </h1>
    </div>
  );
};
