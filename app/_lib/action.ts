"use server";

import { signIn } from "./auth";

export async function signInAction() {
  await signIn("microsoft-entra-id", { redirectTo: "/login" });
}
