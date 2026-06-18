"use client";

import { useRef, useState } from "react";
import type { Asset } from "@/lib/assets";

function human(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

export default function AssetManager({
  kind,
  title,
  assets,
  onChanged,
}: {
  kind: "mods" | "tilesets";
  title: string;
  assets: Asset[];
  onChanged: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (nameRef.current?.value) fd.append("name", nameRef.current.value);
      const res = await fetch(`/api/assets/${kind}`, { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Upload failed");
      if (fileRef.current) fileRef.current.value = "";
      if (nameRef.current) nameRef.current.value = "";
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(name: string) {
    if (!confirm(`Delete ${kind.slice(0, -1)} "${name}"?`)) return;
    const res = await fetch(`/api/assets/${kind}/${encodeURIComponent(name)}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j.error || "Delete failed");
    }
    await onChanged();
  }

  return (
    <div>
      <h2>{title}</h2>
      <form className="card" onSubmit={upload}>
        <div className="field">
          <label>Upload a .zip (or single file)</label>
          <input ref={fileRef} type="file" accept=".zip,application/zip" />
        </div>
        <div className="field">
          <label>Name (optional — defaults to the file name)</label>
          <input ref={nameRef} placeholder={`my-${kind.slice(0, -1)}`} />
        </div>
        <div className="row">
          <button type="submit" disabled={busy}>
            {busy ? "Uploading…" : "Upload"}
          </button>
          {error && <span className="error">{error}</span>}
        </div>
      </form>

      {assets.length === 0 ? (
        <p className="muted">None uploaded.</p>
      ) : (
        assets.map((a) => (
          <div className="card" key={a.name}>
            <div className="row">
              <span>{a.name}</span>
              <span className="muted">{human(a.sizeBytes)}</span>
              <span className="spacer" />
              <button className="danger" onClick={() => remove(a.name)}>
                Delete
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
