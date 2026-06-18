"use client";

import { useState } from "react";
import type { Instance } from "@/lib/docker";

export default function InstanceCard({
  instance,
  onChanged,
}: {
  instance: Instance;
  onChanged: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [logs, setLogs] = useState<string | null>(null);
  const running = instance.state === "running";

  async function act(path: string, method: "POST" | "DELETE") {
    setBusy(true);
    try {
      const res = await fetch(path, { method });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j.error || `${method} ${path} failed`);
      }
      await onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function viewLogs() {
    const res = await fetch(`/api/instances/${instance.id}/logs`, {
      cache: "no-store",
    });
    setLogs(res.ok ? await res.text() : "Failed to load logs");
  }

  const port = instance.webPort;
  // The panel can't know your SSH host, so template it.
  const tunnel = `ssh -N -L ${port}:localhost:${port} <ssh-host>`;

  return (
    <div className="card">
      <div className="row">
        <strong>{instance.name}</strong>
        <span className={`badge ${running ? "running" : "stopped"}`}>
          {instance.state}
        </span>
        <span className="muted">{instance.edition}</span>
        <span className="muted">· {instance.status}</span>
        <span className="spacer" />
        {running ? (
          <button className="secondary" disabled={busy} onClick={() => act(`/api/instances/${instance.id}/stop`, "POST")}>
            Stop
          </button>
        ) : (
          <button disabled={busy} onClick={() => act(`/api/instances/${instance.id}/start`, "POST")}>
            Start
          </button>
        )}
        <button className="secondary" onClick={viewLogs}>Logs</button>
        <button
          className="danger"
          disabled={busy}
          onClick={() => {
            if (confirm(`Remove instance "${instance.name}"? Saves on disk are kept.`))
              act(`/api/instances/${instance.id}`, "DELETE");
          }}
        >
          Remove
        </button>
      </div>

      <div style={{ marginTop: 8 }}>
        <span className="muted">Port {port} (loopback). Tunnel + open:</span>
        <pre>{tunnel}
# then open http://localhost:{port}/</pre>
      </div>

      {logs !== null && (
        <details open>
          <summary className="muted">logs</summary>
          <pre style={{ maxHeight: 300 }}>{logs}</pre>
        </details>
      )}
    </div>
  );
}
