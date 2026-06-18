"use client";

import { useCallback, useState } from "react";
import type { Instance } from "@/lib/docker";
import type { Asset } from "@/lib/assets";
import SpawnForm from "./SpawnForm";
import InstanceCard from "./InstanceCard";
import AssetManager from "./AssetManager";

type Props = {
  initialInstances: Instance[];
  initialMods: Asset[];
  initialTilesets: Asset[];
};

export default function Dashboard({
  initialInstances,
  initialMods,
  initialTilesets,
}: Props) {
  const [instances, setInstances] = useState(initialInstances);
  const [mods, setMods] = useState(initialMods);
  const [tilesets, setTilesets] = useState(initialTilesets);

  const refreshInstances = useCallback(async () => {
    const res = await fetch("/api/instances", { cache: "no-store" });
    const json = await res.json();
    if (res.ok) setInstances(json.instances);
  }, []);

  const refreshAssets = useCallback(async (kind: "mods" | "tilesets") => {
    const res = await fetch(`/api/assets/${kind}`, { cache: "no-store" });
    const json = await res.json();
    if (res.ok) (kind === "mods" ? setMods : setTilesets)(json.assets);
  }, []);

  return (
    <>
      <section>
        <h2>Spawn an instance</h2>
        <SpawnForm
          mods={mods}
          tilesets={tilesets}
          onSpawned={refreshInstances}
        />
      </section>

      <section>
        <h2>Instances ({instances.length})</h2>
        {instances.length === 0 && (
          <p className="muted">No instances yet — spawn one above.</p>
        )}
        {instances.map((i) => (
          <InstanceCard key={i.id} instance={i} onChanged={refreshInstances} />
        ))}
      </section>

      <section className="grid2">
        <AssetManager
          kind="mods"
          title="Mods"
          assets={mods}
          onChanged={() => refreshAssets("mods")}
        />
        <AssetManager
          kind="tilesets"
          title="Tilesets"
          assets={tilesets}
          onChanged={() => refreshAssets("tilesets")}
        />
      </section>
    </>
  );
}
