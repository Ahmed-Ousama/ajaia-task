"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Loader2, Upload } from "lucide-react";
import { IMPORT_EXTENSIONS, MAX_UPLOAD_BYTES, MAX_UPLOAD_LABEL, isImportable } from "@/lib/files";
import { uploadFile, type DuplicateInfo } from "@/lib/upload-client";
import DuplicateFileDialog from "@/components/DuplicateFileDialog";

export default function ImportButton() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ file: File; duplicate: DuplicateInfo } | null>(null);

  async function send(file: File, allowDuplicate = false) {
    setBusy(true);
    setError(null);
    try {
      const res = await uploadFile<{ id: string }>("/api/documents/import", file, allowDuplicate);
      if (!res.ok) {
        setPending({ file, duplicate: res.duplicate }); // ask before importing the same file again
        setBusy(false);
        return;
      }
      setPending(null);
      router.push(`/documents/${res.data.id}`);
    } catch (e) {
      setPending(null);
      setError((e as Error).message);
      setBusy(false);
    }
  }

  function onFile(file: File | undefined) {
    if (input.current) input.current.value = "";
    if (!file) return;
    // Client-side checks for fast feedback; the server enforces the same rules.
    if (!isImportable(file.name)) return setError(`Unsupported file. Use ${IMPORT_EXTENSIONS.join(", ")}.`);
    if (file.size > MAX_UPLOAD_BYTES) return setError(`File is too large (max ${MAX_UPLOAD_LABEL}).`);
    void send(file);
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        onClick={() => input.current?.click()}
        disabled={busy}
        className="group flex h-36 w-40 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-gray-300 bg-white shadow-sm transition hover:border-blue-400 hover:shadow-md disabled:opacity-60"
      >
        <span className="grid h-12 w-12 place-items-center rounded-full bg-gray-100 text-gray-600 transition group-hover:bg-blue-600 group-hover:text-white">
          {busy ? <Loader2 size={22} className="animate-spin" /> : <Upload size={22} />}
        </span>
        <span className="text-sm font-medium text-gray-800">{busy ? "Importing…" : "Import file"}</span>
      </button>
      <input
        ref={input}
        type="file"
        accept={IMPORT_EXTENSIONS.join(",")}
        className="hidden"
        onChange={(e) => onFile(e.target.files?.[0])}
      />
      <p className="w-40 text-center text-[11px] leading-snug text-gray-500">.txt · .md · .docx up to {MAX_UPLOAD_LABEL}</p>
      {error && <p className="max-w-40 text-xs text-red-600">{error}</p>}
      {pending && (
        <DuplicateFileDialog
          newFilename={pending.file.name}
          duplicate={pending.duplicate}
          busy={busy}
          onCancel={() => setPending(null)}
          onConfirm={() => send(pending.file, true)}
        />
      )}
    </div>
  );
}
