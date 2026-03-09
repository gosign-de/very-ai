"use client";

import React, { useEffect, useRef } from "react";
import Loading from "@/app/[locale]/loading";
import { signIn } from "@/app/_lib/signIn";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

const Login = () => {
  const { data: userSession, status } = useSession();
  const router = useRouter();
  const hasCalledAuth = useRef(false);

  useEffect(() => {
    // Redirect to home if not authenticated
    if (!userSession && status === "unauthenticated") {
      router.push("/");
    }
  }, [router, userSession, status]);

  useEffect(() => {
    const autoSignIn = async () => {
      // Prevent duplicate calls
      if (hasCalledAuth.current) return;

      if (userSession && status === "authenticated") {
        hasCalledAuth.current = true;
        await signIn();
      }
    };

    autoSignIn();
  }, [userSession, status]);

  return <Loading />;
};

export default Login;
