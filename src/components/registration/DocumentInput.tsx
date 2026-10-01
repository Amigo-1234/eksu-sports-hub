"use client";

import { useId, useState } from "react";
import { ACCEPT, MAX_DOC_BYTES, type DocKind } from "@/lib/registration/rules";

export interface UploadedDoc {
  path: string;
  type: string;
  size: number;
  name: string;
}

/** Downscale large photos in the browser (JPEG, longest side 1600px) so uploads stay small on mobile data. */
async function shrinkImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.size < 900 * 1024) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], "upload.jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

/**
 * One private document: choose → (shrink) → upload through our server →
 * preview. The file goes to /api/register/upload, never straight to Storage.
 */
export function DocumentInput({
  kind,
  label,
  hint,
  personId,
  value,
  onChange,
  getToken,
  error,
}: {
  kind: DocKind;
  label: string;
  hint: string;
  personId: string;
  value: UploadedDoc | null;
  onChange: (doc: UploadedDoc | null) => void;
  getToken: () => Promise<string | null>;
  error?: string;
}) {
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  async function choose(file: File | undefined) {
    if (!file) return;
    setProblem(null);
    setBusy(true);
    try {
      const small = await shrinkImage(file);
      if (small.size > MAX_DOC_BYTES) throw new Error("This file is larger than 4 MB. Choose a smaller file or take a new photo.");
      const token = await getToken();
      if (!token) throw new Error("Registration is not available right now. Please try again.");
      const fd = new FormData();
      fd.set("token", token);
      fd.set("person", personId);
      fd.set("kind", kind);
      fd.set("file", small, small.name);
      const res = await fetch("/api/register/upload", { method: "POST", body: fd });
      const body = (await res.json().catch(() => null)) as { ok: boolean; error?: string; path?: string; type?: string; size?: number } | null;
      if (!res.ok || !body?.ok || !body.path) throw new Error(body?.error ?? "The upload failed. Check your connection and try again.");
      if (preview) URL.revokeObjectURL(preview);
      setPreview(small.type.startsWith("image/") ? URL.createObjectURL(small) : null);
      onChange({ path: body.path, type: body.type ?? small.type, size: body.size ?? small.size, name: file.name.slice(0, 60) });
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "The upload failed.");
    } finally {
      setBusy(false);
    }
  }

  const shown = problem ?? error;
  return (
    <div className={`rounded-card border p-3 ${shown ? "border-loss" : "border-line"} bg-surface`}>
      <p className="text-sm font-bold" id={`${id}-label`}>
        {label} <span className="text-loss">*</span>
      </p>
      <p className="text-xs text-ink-muted">{hint}</p>
      <div className="mt-2 flex items-center gap-3">
        <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-lg border border-line bg-subtle text-xs font-bold text-ink-muted">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element -- local object URL preview
            <img src={preview} alt={`${label} preview`} className="size-full object-cover" />
          ) : value ? (
            <span className="px-1 text-center">{value.type === "application/pdf" ? "PDF ✓" : "Uploaded ✓"}</span>
          ) : (
            <span aria-hidden="true">{kind === "photo" ? "Photo" : "ID"}</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <label
            htmlFor={id}
            className={`inline-flex h-12 cursor-pointer items-center justify-center rounded-lg border border-line-strong px-4 text-sm font-bold hover:bg-subtle ${
              busy ? "pointer-events-none opacity-60" : ""
            }`}
          >
            {busy ? "Uploading…" : value ? "Replace file" : "Choose file"}
          </label>
          <input
            id={id}
            type="file"
            accept={ACCEPT[kind]}
            aria-labelledby={`${id}-label`}
            aria-describedby={shown ? `${id}-error` : undefined}
            className="sr-only"
            disabled={busy}
            onChange={(e) => {
              void choose(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          {value && !busy && <p className="mt-1 truncate text-xs text-win">Uploaded: {value.name}</p>}
        </div>
      </div>
      {shown && (
        <p id={`${id}-error`} role="alert" className="mt-2 text-sm font-semibold text-loss">
          {shown}
        </p>
      )}
    </div>
  );
}
