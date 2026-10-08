import { redirect } from "next/navigation";
import { createSession, isLoggedIn, passwordMatches } from "@/lib/auth";

// Auth gates the whole page, so rendering deliberately blocks on the session
// cookie. `instant = false` tells Next 16 that is intentional rather than an
// oversight — streaming a shell and then redirecting would be worse UX.
export const instant = false;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await isLoggedIn()) redirect("/");
  const { error } = await searchParams;

  async function login(formData: FormData) {
    "use server";
    const password = String(formData.get("password") ?? "");
    if (!passwordMatches(password)) redirect("/login?error=1");
    await createSession();
    redirect("/");
  }

  return (
    <main className="min-h-dvh grid place-items-center bg-neutral-50 px-6">
      <form action={login} className="w-full max-w-sm">
        <h1 className="text-xl font-semibold tracking-tight text-neutral-900">Ad spend</h1>
        <p className="mt-1 text-sm text-neutral-500">Internal dashboard</p>

        <input
          name="password"
          type="password"
          autoFocus
          required
          placeholder="Password"
          className="mt-6 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-[15px] outline-none focus:border-neutral-900"
        />

        {error ? (
          <p className="mt-2 text-sm text-red-600">Wrong password.</p>
        ) : null}

        <button className="mt-3 w-full rounded-lg bg-neutral-900 px-3 py-2.5 text-[15px] font-medium text-white hover:bg-neutral-800">
          Sign in
        </button>
      </form>
    </main>
  );
}
