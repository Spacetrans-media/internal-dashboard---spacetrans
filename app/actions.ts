"use server";

import { revalidatePath } from "next/cache";
import { destroySession, isLoggedIn } from "@/lib/auth";
import { syncAllAccounts } from "@/lib/sync";
import { redirect } from "next/navigation";

/** Manual refresh. Cheap enough to be un-throttled at this team size. */
export async function syncNow() {
  if (!(await isLoggedIn())) redirect("/login");
  await syncAllAccounts("manual");
  revalidatePath("/");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}
