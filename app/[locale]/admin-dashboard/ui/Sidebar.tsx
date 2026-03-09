"use client";

import { ChatbotUISVG } from "@/components/icons/chatbotui-svg";
import MainNav from "./MainNav";
import { useTheme } from "next-themes";

interface Sidebar {
  theme?: "dark" | "light";
}

function Sidebar() {
  const { theme } = useTheme();
  return (
    <aside className="bg-grey border-grey row-span-full flex flex-col gap-[32px] border-r p-[32px_18px]">
      <div className="flex flex-col gap-[8px]">
        <div className="theme mx-auto my-0">
          <ChatbotUISVG
            theme={theme === "dark" ? "dark" : "light"}
            compact={true}
          />
        </div>
      </div>
      <MainNav />
    </aside>
  );
}

export default Sidebar;
