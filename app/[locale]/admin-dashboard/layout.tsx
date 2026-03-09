"use client";

import Sidebar from "./ui/Sidebar";
import Header from "./ui/Header";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/browser-client";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { ModelFilterProvider } from "./context/ModelFilterContext";
import { getIsAdminGroups } from "@/db/azure_groups";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,
    },
  },
});

function AppLayout({ children }) {
  const router = useRouter();
  const { data: session } = useSession();
  const [hasAccess, setHasAccess] = useState(false);

  const groups = session?.user?.groups || ([] as { id: string }[]);
  const groupIds = groups.map(group => group.id);

  useEffect(() => {
    (async () => {
      const session = (await supabase.auth.getSession()).data.session;
      if (!session) {
        return router.push("/login");
      }
      const isAdmin = await getIsAdminGroups(groupIds);

      if (isAdmin) {
        setHasAccess(true);
      } else {
        router.push("/no-access");
      }
    })();
  }, [groupIds, router]);

  if (!hasAccess) {
    return null;
  }
  return (
    <QueryClientProvider client={queryClient}>
      <ReactQueryDevtools initialIsOpen={false} />
      <div className="grid h-screen w-full grid-cols-[260px_1fr] grid-rows-[auto_1fr]">
        <Header />
        <Sidebar />
        <main className="bg-inputBg overflow-scroll p-[48px_64px]">
          <div className="mx-auto flex max-w-[1200px] flex-col gap-[32px]">
            <ModelFilterProvider>{children}</ModelFilterProvider>
          </div>
        </main>
      </div>
    </QueryClientProvider>
  );
}

export default AppLayout;
