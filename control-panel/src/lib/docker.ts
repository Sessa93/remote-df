import "server-only";
import type Docker from "dockerode";
import path from "node:path";
import tarFs from "tar-fs";
import { docker } from "./dockerClient";
import {
  config,
  CONTAINER_SAVE_DIR,
  CONTAINER_BACKUP_DIR,
  CONTAINER_MODS_DIR,
  LABELS,
  memoryToBytes,
} from "./config";

export type Instance = {
  id: string;
  name: string;
  edition: string;
  webPort: number;
  state: string; // running | exited | created | ...
  status: string; // human-readable ("Up 3 minutes")
  createdAt: number;
};

export type SpawnOptions = {
  name: string;
  edition?: string;
  geom?: string;
  mods?: string[]; // asset folder names under <data>/mods
  tilesets?: string[]; // asset folder names under <data>/tilesets
  autopause?: boolean;
};

const NAME_RE = /^[a-z0-9][a-z0-9_-]{0,30}$/;

function toInstance(c: Docker.ContainerInfo): Instance {
  const labels = c.Labels || {};
  return {
    id: c.Id,
    name: (c.Names?.[0] || "").replace(/^\//, ""),
    edition: labels[LABELS.edition] || "classic",
    webPort: Number(labels[LABELS.webPort] || 0),
    state: c.State,
    status: c.Status,
    createdAt: c.Created,
  };
}

export async function listInstances(): Promise<Instance[]> {
  const containers = await docker().listContainers({
    all: true,
    filters: { label: [`${LABELS.managed}=true`] },
  });
  return containers.map(toInstance).sort((a, b) => b.createdAt - a.createdAt);
}

// Lowest free loopback port at/above basePort, skipping ports already assigned
// to managed instances.
async function nextFreePort(): Promise<number> {
  const used = new Set((await listInstances()).map((i) => i.webPort));
  let p = config.basePort;
  while (used.has(p)) p += 1;
  return p;
}

export async function spawnInstance(opts: SpawnOptions): Promise<Instance> {
  const name = opts.name.trim().toLowerCase();
  if (!NAME_RE.test(name)) {
    throw new Error(
      "Name must be 1-31 chars: lowercase letters, digits, '-' or '_'.",
    );
  }
  const containerName = `df-${name}`;
  const existing = await listInstances();
  if (existing.some((i) => i.name === containerName)) {
    throw new Error(`An instance named "${name}" already exists.`);
  }

  const edition = opts.edition === "steam" ? "steam" : "classic";
  const webPort = await nextFreePort();

  // Named volumes (managed by the target daemon, so this works whether the
  // daemon is local or remote). Reusing a name keeps a prior fort's saves.
  const savesVol = `${containerName}-saves`;
  const backupsVol = `${containerName}-backups`;

  const d = docker();
  const container = await d.createContainer({
    Image: config.dfImage,
    name: containerName,
    Labels: {
      [LABELS.managed]: "true",
      [LABELS.instance]: name,
      [LABELS.webPort]: String(webPort),
      [LABELS.edition]: edition,
    },
    Env: [
      `GEOM=${opts.geom || "1280x800"}`,
      `DF_AUTOPAUSE=${opts.autopause === false ? "0" : "1"}`,
    ],
    ExposedPorts: { "6080/tcp": {} },
    HostConfig: {
      Binds: [
        `${savesVol}:${CONTAINER_SAVE_DIR}`,
        `${backupsVol}:${CONTAINER_BACKUP_DIR}`,
      ],
      PortBindings: {
        "6080/tcp": [{ HostIp: "127.0.0.1", HostPort: String(webPort) }],
      },
      RestartPolicy: { Name: "unless-stopped" },
      NanoCpus: Math.round(parseFloat(config.dfCpus) * 1e9),
      Memory: memoryToBytes(config.dfMemory),
      PidsLimit: 512,
    },
  });

  await container.start();

  // Stream selected mods/tilesets into the running container (no host paths —
  // works against a remote daemon). Best-effort: a failure here shouldn't kill
  // an otherwise-running instance.
  const assets = [
    ...(opts.mods || []).map((n) => ({ kind: "mods" as const, name: n })),
    ...(opts.tilesets || []).map((n) => ({ kind: "tilesets" as const, name: n })),
  ];
  if (assets.length) {
    try {
      await injectAssets(container, assets);
    } catch (err) {
      console.error(`[spawn] asset injection failed for ${containerName}:`, err);
    }
  }

  return (await listInstances()).find((i) => i.id === container.id)!;
}

// Copy asset folders into the container under CONTAINER_MODS_DIR/<name> via the
// Docker API (putArchive), creating the mods dir first.
async function injectAssets(
  container: Docker.Container,
  assets: { kind: "mods" | "tilesets"; name: string }[],
): Promise<void> {
  await execInContainer(container, ["mkdir", "-p", CONTAINER_MODS_DIR]);
  for (const { kind, name } of assets) {
    const safe = path.basename(name);
    const src = path.join(config.dataRoot, kind, safe);
    // Prefix every tar entry with the asset folder name so it lands at
    // CONTAINER_MODS_DIR/<name>/...
    const pack = tarFs.pack(src, {
      map: (header) => {
        header.name = path.posix.join(safe, header.name);
        return header;
      },
    });
    await container.putArchive(pack, { path: CONTAINER_MODS_DIR });
  }
}

async function execInContainer(
  container: Docker.Container,
  Cmd: string[],
): Promise<void> {
  const exec = await container.exec({
    Cmd,
    AttachStdout: true,
    AttachStderr: true,
  });
  const stream = await exec.start({});
  await new Promise<void>((resolve, reject) => {
    stream.on("end", resolve);
    stream.on("error", reject);
    stream.resume();
  });
}

function byId(id: string) {
  return docker().getContainer(id);
}

export async function startInstance(id: string) {
  await byId(id).start();
}

export async function stopInstance(id: string) {
  await byId(id).stop({ t: 10 });
}

// Remove the container. Named volumes (saves/backups) are intentionally kept so
// re-spawning the same name restores the fort.
export async function removeInstance(id: string) {
  await byId(id).remove({ force: true });
}

// Last lines of the container's stdout/stderr (the entrypoint tails DF logs).
export async function instanceLogs(id: string, tail = 200): Promise<string> {
  const buf = (await byId(id).logs({
    stdout: true,
    stderr: true,
    tail,
  })) as unknown as Buffer;
  return stripDockerLogHeader(buf);
}

function stripDockerLogHeader(buf: Buffer): string {
  const out: Buffer[] = [];
  let i = 0;
  while (i < buf.length) {
    if (i + 8 <= buf.length && (buf[i] === 1 || buf[i] === 2) && buf[i + 1] === 0) {
      const len = buf.readUInt32BE(i + 4);
      out.push(buf.subarray(i + 8, i + 8 + len));
      i += 8 + len;
    } else {
      out.push(buf.subarray(i));
      break;
    }
  }
  return Buffer.concat(out).toString("utf8");
}
