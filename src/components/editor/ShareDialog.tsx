"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, jsonInit } from "@/lib/api-client";
import type { ShareRole } from "@/lib/access";
import type { ShareDTO } from "./types";

export default function ShareDialog({
  documentId,
  owner,
  initialShares,
  onClose,
  onChange,
}: {
  documentId: string;
  owner: { name: string; email: string };
  initialShares: ShareDTO[];
  onClose: () => void;
  onChange: (count: number) => void;
}) {
  const router = useRouter();
  const [shares, setShares] = useState(initialShares);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<ShareRole>("EDITOR");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function update(next: ShareDTO[]) {
    setShares(next);
    onChange(next.length);
    router.refresh(); // keep server-rendered data (dashboard badges) in sync
  }

  async function grant(targetEmail: string, targetRole: ShareRole) {
    setBusy(true);
    setError(null);
    try {
      const share = await api<ShareDTO>(
        `/api/documents/${documentId}/shares`,
        jsonInit("POST", { email: targetEmail, role: targetRole }),
      );
      const rest = shares.filter((s) => s.user.id !== share.user.id);
      update([...rest, share]);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (await grant(email, role)) setEmail("");
  }

  async function revoke(userId: string) {
    setError(null);
    try {
      await api(`/api/documents/${documentId}/shares/${userId}`, { method: "DELETE" });
      update(shares.filter((s) => s.user.id !== userId));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-title"
        className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id="share-title" className="text-lg font-semibold text-gray-900">
            Share document
          </h2>
          <button onClick={onClose} className="rounded p-1 text-gray-500 hover:bg-gray-100" aria-label="Close">
            ✕
          </button>
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-2 sm:flex-row">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@ajaia.test"
            aria-label="Email address"
            className="min-w-0 flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as ShareRole)}
            aria-label="Access level"
            className="rounded-md border border-gray-300 px-2 py-2 text-sm"
          >
            <option value="EDITOR">Can edit</option>
            <option value="VIEWER">View only</option>
          </select>
          <button
            disabled={busy}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {busy ? "Sharing…" : "Share"}
          </button>
        </form>
        <p className="mt-2 text-xs text-gray-500">
          Demo users: alice@ajaia.test, bob@ajaia.test, carol@ajaia.test
        </p>
        {error && (
          <p className="mt-2 rounded bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {error}
          </p>
        )}

        <h3 className="mb-2 mt-5 text-sm font-medium text-gray-700">People with access</h3>
        <ul className="divide-y divide-gray-100 rounded-md border border-gray-200">
          <li className="flex items-center justify-between px-3 py-2">
            <div>
              <div className="text-sm font-medium text-gray-900">{owner.name}</div>
              <div className="text-xs text-gray-500">{owner.email}</div>
            </div>
            <span className="text-xs text-gray-500">Owner</span>
          </li>
          {shares.map((s) => (
            <li key={s.user.id} className="flex items-center justify-between gap-2 px-3 py-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-gray-900">{s.user.name}</div>
                <div className="truncate text-xs text-gray-500">{s.user.email}</div>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={s.role}
                  onChange={(e) => grant(s.user.email, e.target.value as ShareRole)}
                  aria-label={`Access for ${s.user.name}`}
                  className="rounded border border-gray-200 px-1 py-1 text-xs"
                >
                  <option value="EDITOR">Can edit</option>
                  <option value="VIEWER">View only</option>
                </select>
                <button
                  onClick={() => revoke(s.user.id)}
                  className="rounded px-2 py-1 text-xs text-gray-500 hover:bg-red-50 hover:text-red-700"
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
