import { listInstances } from "@/lib/docker";
import { listAssets } from "@/lib/assets";
import Dashboard from "@/components/Dashboard";

export const dynamic = "force-dynamic";

export default async function Page() {
  // Load initial state server-side (this process can reach the Docker socket).
  const [instances, mods, tilesets] = await Promise.all([
    listInstances().catch(() => []),
    listAssets("mods").catch(() => []),
    listAssets("tilesets").catch(() => []),
  ]);

  return (
    <Dashboard
      initialInstances={instances}
      initialMods={mods}
      initialTilesets={tilesets}
    />
  );
}
