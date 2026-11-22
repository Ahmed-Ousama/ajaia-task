"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { api, jsonInit } from "@/lib/api-client";

export default function NewDocumentButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const { id } = await api<{ id: string }>("/api/documents", jsonInit("POST", {}));
      router.push(`/documents/${id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      <button
        onClick={create}
        disabled={busy}
        className="group flex h-36 w-40 flex-col items-center justify-center gap-3 rounded-xl border border-gray-200 bg-white shadow-sm transition hover:border-blue-400 hover:shadow-md disabled:opacity-60"
      >
        <span className="grid h-12 w-12 place-items-center rounded-full bg-blue-50 text-blue-600 transition group-hover:bg-blue-600 group-hover:text-white">
          {busy ? <Loader2 size={22} className="animate-spin" /> : <Plus size={24} />}
        </span>
        <span className="text-sm font-medium text-gray-800">{busy ? "Creating…" : "Blank document"}</span>
      </button>
      {error && <p className="max-w-40 text-xs text-red-600">{error}</p>}
    </div>
  );
}
