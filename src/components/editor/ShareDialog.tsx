"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { userColor } from "@/lib/user-color";
import { initials } from "@/components/UserMenu";
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
  // Workspace people for the picker (loaded once; filtered instantly as you type).
  const [people, setPeople] = useState<{ id: string; name: string; email: string }[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const shareButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    api<{ id: string; name: string; email: string }[]>("/api/users").then(setPeople).catch(() => {});
  }, []);

  const suggestions = useMemo(() => {
    const taken = new Set(shares.map((s) => s.user.id));
    const q = email.trim().toLowerCase();
    return people
      .filter((p) => !taken.has(p.id) && p.email !== owner.email)
      .filter((p) => !q || p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q))
      .slice(0, 8);
  }, [people, shares, email, owner.email]);

  function choose(p: { email: string }) {
    setEmail(p.email);
    setPickerOpen(false);
    setHighlight(0);
    shareButton.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!pickerOpen || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => (h + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => (h - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === "Enter" && suggestions[highlight] && !suggestions.some((p) => p.email === email)) {
      e.preventDefault();
      choose(suggestions[highlight]);
    } else if (e.key === "Escape") {
      e.stopPropagation();
      setPickerOpen(false);
    }
  }

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
          <div className="relative min-w-0 flex-1">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setPickerOpen(true);
                setHighlight(0);
              }}
              onFocus={() => setPickerOpen(true)}
              onBlur={() => setTimeout(() => setPickerOpen(false), 150)}
              onKeyDown={onKeyDown}
              placeholder="Add people by name or email"
              aria-label="Person to share with"
              role="combobox"
              aria-expanded={pickerOpen && suggestions.length > 0}
              aria-controls="share-people"
              autoComplete="off"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
            {pickerOpen && suggestions.length > 0 && (
              <ul
                id="share-people"
                role="listbox"
                className="absolute left-0 right-0 z-10 mt-1 max-h-64 overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
              >
                {suggestions.map((p, i) => (
                  <li key={p.id} role="option" aria-selected={i === highlight}>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onMouseEnter={() => setHighlight(i)}
                      onClick={() => choose(p)}
                      className={`flex w-full items-center gap-3 px-3 py-2 text-left ${i === highlight ? "bg-blue-50" : ""}`}
                    >
                      <span
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-semibold text-white"
                        style={{ backgroundColor: userColor(p.id) }}
                        aria-hidden
                      >
                        {initials(p.name)}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-gray-900">{p.name}</span>
                        <span className="block truncate text-xs text-gray-500">{p.email}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
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
            ref={shareButton}
            disabled={busy}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {busy ? "Sharing…" : "Share"}
          </button>
        </form>
        <p className="mt-2 text-xs text-gray-500">Pick someone from your workspace or type their email.</p>
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
