// components/MicrosoftSignInButton.tsx
"use client";
import React from "react";
import microsoftlogo from "@/public/providers/microsoftlogo.png";

const MicrosoftSignInButton = () => {
  const handleSignIn = () => {
    window.location.href = process.env.NEXT_PUBLIC_AZURE_SSO_URL || "/api/auth/signin";
  };

  return (
    <button
      type="button"
      onClick={handleSignIn}
      className="text-primary ml-1 underline hover:opacity-80"
    >
      <img src={microsoftlogo.src} alt="Sign in with Microsoft" />
    </button>
  );
};

export default MicrosoftSignInButton;
