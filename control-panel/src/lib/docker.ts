import "server-only";
import Docker from "dockerode";
import path from "node:path";
import fs from "node:fs/promises";
import {
  config,
  CONTAINER_SAVE_DIR,
  CONTAINER_BACKUP_DIR,
  CONTAINER_MODS_DIR,
  LABELS,
  memoryToBytes,
} from "./config";

const docker = new Docker({ socketPath: config.dockerSocket });

export type Instance = {
  id: string;
  name: string;
  edition: string;
  webPort: number;
  state: string; // running | exited | created | ...
  status: string; // human-readable ("Up 3 minutes")
  health?: string;
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
  const containers = await docker.listContainers({
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

// Build host-path bind specs for selected mod/tileset asset folders. Each asset
// folder is mounted read-only under the container's mods dir.
function assetBinds(kind: "mods" | "tilesets", names: string[]): string[] {
  return (names || []).map((name) => {
    const safe = path.basename(name); // never escape the asset dir
    const hostSrc = path.posix.join(config.hostDataRoot, kind, safe);
    const target = `${CONTAINER_MODS_DIR}/${safe}`;
    return `${hostSrc}:${target}:ro`;
  });
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

  // Per-instance host directories for persistent saves + backups.
  const savesHost = path.posix.join(config.hostDataRoot, "instances", name, "saves");
  const backupsHost = path.posix.join(config.hostDataRoot, "instances", name, "backups");
  // Create them via the panel's own view of the shared volume.
  const savesLocal = path.join(config.dataRoot, "instances", name, "saves");
  const backupsLocal = path.join(config.dataRoot, "instances", name, "backups");
  await fs.mkdir(savesLocal, { recursive: true });
  await fs.mkdir(backupsLocal, { recursive: true });

  const binds = [
    `${savesHost}:${CONTAINER_SAVE_DIR}`,
    `${backupsHost}:${CONTAINER_BACKUP_DIR}`,
    ...assetBinds("mods", opts.mods || []),
    ...assetBinds("tilesets", opts.tilesets || []),
  ];

  const container = await docker.createContainer({
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
      Binds: binds,
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
  return (await listInstances()).find((i) => i.id === container.id)!;
}

async function byId(id: string) {
  return docker.getContainer(id);
}

export async function startInstance(id: string) {
  await (await byId(id)).start();
}

export async function stopInstance(id: string) {
  await (await byId(id)).stop({ t: 10 });
}

export async function removeInstance(id: string) {
  await (await byId(id)).remove({ force: true });
}

// Last lines of the container's stdout/stderr (the entrypoint tails DF logs).
export async function instanceLogs(id: string, tail = 200): Promise<string> {
  const buf = (await (await byId(id)).logs({
    stdout: true,
    stderr: true,
    tail,
  })) as unknown as Buffer;
  // Strip Docker's 8-byte stream multiplexing headers if present.
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
