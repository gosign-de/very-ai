// Import the functions
import { auth } from "@/app/_lib/auth";
import { redirect } from "next/navigation";

export default async function AfterLogin() {
  const userSession = await auth();
  const email = userSession?.user?.name;
  return redirect(`/login?email=${email}`);
}
