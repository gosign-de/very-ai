"use client";

import { ChatbotUISVG } from "@/components/icons/chatbotui-svg";
import { useTheme } from "next-themes";
import { signInAction } from "../_lib/action";
import { useState, useEffect, useRef } from "react";
import { IconLoader2 } from "@tabler/icons-react";
import Image from "next/image";
import MicrosoftLogo from "@/public/microsoft.svg";
import { useTranslation } from "react-i18next";
import { useSession } from "next-auth/react";
import { signIn } from "@/app/_lib/signIn";
import { useRouter } from "next/navigation";
import Loading from "./loading";
import { supabase } from "@/lib/supabase/browser-client";

export default function HomePage() {
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);
  const { theme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const { data: userSession, status } = useSession();
  const hasCalledSignIn = useRef(false);
  const router = useRouter();
  const [isEntraEnabled, setIsEntraEnabled] = useState<boolean | null>(null);

  // Local auth state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    setMounted(true);
    fetch("/api/auth/config")
      .then(res => res.json())
      .then(data => setIsEntraEnabled(data.entraEnabled))
      .catch(() => setIsEntraEnabled(false));
  }, []);

  const handleClick = () => {
    setIsLoading(true);
  };

  // Entra ID flow: bridge NextAuth session → GoTrue session
  useEffect(() => {
    if (
      isEntraEnabled &&
      userSession?.user &&
      status === "authenticated" &&
      !hasCalledSignIn.current
    ) {
      hasCalledSignIn.current = true;
      (async () => {
        await signIn();
      })();
    }
  }, [userSession, status, isEntraEnabled]);

  // Local auth: email/password sign-up or sign-in via GoTrue
  const handleLocalAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setAuthError("");

    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) {
          setAuthError(error.message);
          setIsLoading(false);
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) {
          setAuthError(error.message);
          setIsLoading(false);
          return;
        }
      }
      // GoTrue session created → setup page handles onboarding + redirect
      router.push("/setup");
    } catch (err) {
      setAuthError(
        err instanceof Error ? err.message : "Authentication failed",
      );
      setIsLoading(false);
    }
  };

  if (!mounted || isEntraEnabled === null) {
    return null;
  }

  // Entra ID flow: Microsoft SSO
  if (isEntraEnabled) {
    return userSession ? (
      <Loading />
    ) : (
      <div className="flex size-full flex-col items-center justify-center">
        <div className="theme">
          <ChatbotUISVG
            theme={theme === "dark" ? "dark" : "light"}
            scale={0.4}
          />
        </div>
        <form action={signInAction}>
          <button
            className="m-2 mt-7 inline-flex min-w-60 cursor-pointer items-center rounded-lg bg-[#0078d4] px-5 py-2.5 text-center text-white hover:bg-[#0078d4]/90 focus:outline-none focus:ring-4 focus:ring-[#0078d4]/50 disabled:opacity-50 dark:focus:ring-[#0078d4]/50"
            onClick={handleClick}
          >
            {isLoading ? (
              <IconLoader2 className="mx-auto size-7 animate-spin" />
            ) : (
              <>
                <Image
                  src={MicrosoftLogo}
                  alt="Logo"
                  width={28}
                  height={28}
                  className="mr-2"
                />
                {t("Login with Microsoft")}
              </>
            )}
          </button>
        </form>
      </div>
    );
  }

  // Local auth flow: email/password via GoTrue
  return (
    <div className="flex size-full flex-col items-center justify-center">
      <div className="theme">
        <ChatbotUISVG theme={theme === "dark" ? "dark" : "light"} scale={0.4} />
      </div>
      <form
        onSubmit={handleLocalAuth}
        className="mt-7 flex w-80 flex-col gap-3"
      >
        <input
          type="email"
          placeholder={t("Email")}
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-black focus:outline-none focus:ring-2 focus:ring-black/30 dark:border-gray-600 dark:bg-gray-900 dark:text-white dark:focus:ring-white/30"
        />
        <input
          type="password"
          placeholder={t("Password")}
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
          minLength={6}
          className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-black focus:outline-none focus:ring-2 focus:ring-black/30 dark:border-gray-600 dark:bg-gray-900 dark:text-white dark:focus:ring-white/30"
        />
        {authError && <p className="text-sm text-red-500">{authError}</p>}
        <button
          type="submit"
          disabled={isLoading}
          className="inline-flex min-w-60 cursor-pointer items-center justify-center rounded-lg bg-black px-5 py-2.5 text-center text-white hover:bg-black/80 focus:outline-none focus:ring-4 focus:ring-black/30 disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-white/80 dark:focus:ring-white/30"
        >
          {isLoading ? (
            <IconLoader2 className="size-7 animate-spin" />
          ) : isSignUp ? (
            t("Sign Up")
          ) : (
            t("Sign In")
          )}
        </button>
        <button
          type="button"
          onClick={() => {
            setIsSignUp(!isSignUp);
            setAuthError("");
          }}
          className="text-sm text-black hover:underline dark:text-white"
        >
          {isSignUp
            ? t("Already have an account? Sign in")
            : t("Need an account? Sign up")}
        </button>
      </form>
    </div>
  );
}
