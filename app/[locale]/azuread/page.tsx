import { Button } from "@/components/ui/button";

import { signInAction } from "../../_lib/action";

export default function HomePage() {
  return (
    <div className="flex size-full flex-col items-center justify-center">
      <div>
        {/* <ChatbotUISVG theme={theme === "dark" ? "dark" : "light"} scale={0.3} /> */}
      </div>

      <div className="mt-2 text-4xl font-bold">Gosign AI</div>
      <form action={signInAction}>
        <Button variant="default" size="default">
          Login test
        </Button>
      </form>
    </div>
  );
}
