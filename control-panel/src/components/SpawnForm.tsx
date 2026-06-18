"use client";

import { useState } from "react";
import type { Asset } from "@/lib/assets";

export default function SpawnForm({
  mods,
  tilesets,
  onSpawned,
}: {
  mods: Asset[];
  tilesets: Asset[];
  onSpawned: () => void | Promise<void>;
}) {
  const [name, setName] = useState("");
  const [edition, setEdition] = useState("classic");
  const [geom, setGeom] = useState("1280x800");
  const [autopause, setAutopause] = useState(true);
  const [selMods, setSelMods] = useState<string[]>([]);
  const [selTiles, setSelTiles] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function toggle(list: string[], v: string): string[] {
    return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/instances", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          edition,
          geom,
          autopause,
          mods: selMods,
          tilesets: selTiles,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Spawn failed");
      setName("");
      setSelMods([]);
      setSelTiles([]);
      await onSpawned();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={submit}>
      <div className="grid2">
        <div className="field">
          <label>Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="my-fort"
            required
          />
        </div>
        <div className="field">
          <label>Edition</label>
          <select value={edition} onChange={(e) => setEdition(e.target.value)}>
            <option value="classic">classic</option>
            <option value="steam">steam</option>
          </select>
        </div>
        <div className="field">
          <label>Resolution (GEOM)</label>
          <input value={geom} onChange={(e) => setGeom(e.target.value)} />
        </div>
        <div className="field">
          <label>&nbsp;</label>
          <label className="checks">
            <input
              type="checkbox"
              checked={autopause}
              onChange={(e) => setAutopause(e.target.checked)}
            />
            Auto-pause when idle
          </label>
        </div>
      </div>

      {mods.length > 0 && (
        <>
          <label>Mods</label>
          <div className="checks">
            {mods.map((m) => (
              <label key={m.name}>
                <input
                  type="checkbox"
                  checked={selMods.includes(m.name)}
                  onChange={() => setSelMods((l) => toggle(l, m.name))}
                />
                {m.name}
              </label>
            ))}
          </div>
        </>
      )}

      {tilesets.length > 0 && (
        <>
          <label>Tilesets</label>
          <div className="checks">
            {tilesets.map((t) => (
              <label key={t.name}>
                <input
                  type="checkbox"
                  checked={selTiles.includes(t.name)}
                  onChange={() => setSelTiles((l) => toggle(l, t.name))}
                />
                {t.name}
              </label>
            ))}
          </div>
        </>
      )}

      <div className="row" style={{ marginTop: 12 }}>
        <button type="submit" disabled={busy}>
          {busy ? "Spawning…" : "Spawn instance"}
        </button>
        {error && <span className="error">{error}</span>}
      </div>
    </form>
  );
}
