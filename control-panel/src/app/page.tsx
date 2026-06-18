import { listInstances } from "@/lib/docker";
import { listAssets } from "@/lib/assets";
import { dockerTarget } from "@/lib/dockerClient";
import Dashboard from "@/components/Dashboard";

export const dynamic = "force-dynamic";

export default async function Page() {
  // Load initial state server-side (this process holds the Docker connection).
  const [instances, mods, tilesets] = await Promise.all([
    listInstances().catch(() => []),
    listAssets("mods").catch(() => []),
    listAssets("tilesets").catch(() => []),
  ]);

  return (
    <>
      <p className="muted">
        Deploying to <code>{dockerTarget()}</code>
      </p>
      <Dashboard
        initialInstances={instances}
        initialMods={mods}
        initialTilesets={tilesets}
      />
    </>
  );
}
