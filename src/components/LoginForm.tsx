"use client";

import { useActionState, useRef, useState } from "react";
import { loginAction, type LoginState } from "@/auth-actions";

const DEMO_PASSWORD = "password123";
const DEMO_ACCOUNTS = [
  { name: "Alice Admin", email: "alice@ajaia.test", initial: "A", color: "bg-blue-600" },
  { name: "Bob Builder", email: "bob@ajaia.test", initial: "B", color: "bg-emerald-600" },
  { name: "Carol Chen", email: "carol@ajaia.test", initial: "C", color: "bg-amber-600" },
];

export default function LoginForm() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(loginAction, {});
  const [email, setEmail] = useState(state.email ?? "");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const submit = useRef<HTMLButtonElement>(null);

  function fillDemo(account: (typeof DEMO_ACCOUNTS)[number]) {
    setEmail(account.email);
    setPassword(DEMO_PASSWORD);
    submit.current?.focus();
  }

  return (
    <>
      <form action={formAction} className="mt-8 space-y-4" noValidate>
        {state.error && (
          <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {state.error}
          </p>
        )}

        <div>
          <label htmlFor="email" className="mb-1 block text-sm font-medium text-gray-700">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@ajaia.test"
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </div>

        <div>
          <label htmlFor="password" className="mb-1 block text-sm font-medium text-gray-700">
            Password
          </label>
          <div className="relative">
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 pr-16 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              className="absolute inset-y-0 right-0 px-3 text-xs font-medium text-gray-500 hover:text-gray-800"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
        </div>

        <button
          ref={submit}
          type="submit"
          disabled={pending}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-70"
        >
          {pending && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden />}
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <div className="mt-8">
        <div className="flex items-center gap-3 text-xs text-gray-400">
          <span className="h-px flex-1 bg-gray-200" />
          Demo accounts · password <code className="font-mono text-gray-600">{DEMO_PASSWORD}</code>
          <span className="h-px flex-1 bg-gray-200" />
        </div>
        <div className="mt-3 grid gap-2">
          {DEMO_ACCOUNTS.map((a) => (
            <button
              key={a.email}
              type="button"
              onClick={() => fillDemo(a)}
              className={`flex items-center gap-3 rounded-lg border bg-white px-3 py-2 text-left shadow-sm transition-colors hover:border-blue-300 hover:bg-blue-50/40 ${
                email === a.email ? "border-blue-400 ring-2 ring-blue-500/15" : "border-gray-200"
              }`}
            >
              <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-semibold text-white ${a.color}`}>
                {a.initial}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-gray-900">{a.name}</span>
                <span className="block truncate text-xs text-gray-500">{a.email}</span>
              </span>
              <span className="text-xs font-medium text-blue-700">Use</span>
            </button>
          ))}
        </div>
        <p className="mt-6 text-center text-xs text-gray-400">Accounts and passwords are managed in Keycloak.</p>
      </div>
    </>
  );
}
