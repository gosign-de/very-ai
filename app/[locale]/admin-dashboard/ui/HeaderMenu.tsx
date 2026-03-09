"use client";

import { ThemeSwitcher } from "@/components/utility/theme-switcher";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/browser-client";
import { signOut } from "next-auth/react";

function HeaderMenu() {
  const router = useRouter();
  // const navigate = useNavigate();
  const _handleSignOut = async () => {
    // setIsLoading(true)
    await Promise.all([supabase.auth.signOut(), signOut({ redirect: false })]);
    router.push("/login");
    router.refresh();
    return;
  };

  return (
    <ul className="flex items-center gap-2">
      <li>
        <ThemeSwitcher />
      </li>
      <li>
        {/* <Button
      tabIndex={-1}
      className="min-w-[90px] text-xs"
      size="sm"
      onClick={handleSignOut}
    >
      {false ? (
        <IconLoader2 className="mx-auto size-7 animate-spin" />
      ) : (
        <>
          <IconLogout className="mr-1" size={20} />
          Logout
        </>
      )}
    </Button> */}
      </li>
    </ul>
  );
}

export default HeaderMenu;
