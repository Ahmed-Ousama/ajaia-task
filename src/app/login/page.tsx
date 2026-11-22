import { redirect } from "next/navigation";
import { auth } from "@/auth";
import LoginForm from "@/components/LoginForm";
import Logo from "@/components/Logo";

export const metadata = { title: "Sign in · Ajaia Docs" };

export default async function LoginPage() {
  const session = await auth();
  if (session?.user?.id) redirect("/");

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      {/* Brand panel (large screens) */}
      <section className="relative hidden overflow-hidden bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <Logo size={40} light />
        <div className="max-w-md">
          <h2 className="text-4xl font-semibold leading-tight">Write together. Share with intent.</h2>
          <ul className="mt-8 space-y-4 text-blue-100">
            <li className="flex gap-3"><Check /> Rich-text documents that save as you type</li>
            <li className="flex gap-3"><Check /> Share as editor or viewer — enforced on the server</li>
            <li className="flex gap-3"><Check /> Import .md / .docx and attach files securely</li>
          </ul>
        </div>
        <p className="text-sm text-blue-200">Internal productivity tools · Ajaia</p>
        <div className="pointer-events-none absolute -bottom-24 -right-24 h-80 w-80 rounded-full bg-white/10" aria-hidden />
        <div className="pointer-events-none absolute -top-16 right-24 h-40 w-40 rounded-full bg-white/5" aria-hidden />
      </section>

      {/* Sign-in form */}
      <section className="flex items-center justify-center bg-gray-50 px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Logo size={40} />
          </div>
          <h1 className="text-2xl font-semibold text-gray-900">Sign in</h1>
          <p className="mt-1 text-sm text-gray-500">Welcome back — sign in to your workspace.</p>
          <LoginForm />
        </div>
      </section>
    </main>
  );
}

function Check() {
  return (
    <svg className="mt-0.5 h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
