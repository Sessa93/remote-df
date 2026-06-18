// Central runtime config, read from the environment (see .env.example).

export const config = {
  // --- Docker connection ---------------------------------------------------
  // If DOCKER_HOST is unset we use the local socket. Otherwise it may be:
  //   unix:///var/run/docker.sock
  //   tcp://HOST:2376        (+ DOCKER_TLS_VERIFY=1 and DOCKER_CERT_PATH for TLS)
  //   ssh://user@HOST[:22]   (+ DOCKER_SSH_KEY=/path/to/key, or an SSH agent)
  dockerHost: process.env.DOCKER_HOST || "",
  dockerSocket: process.env.DOCKER_SOCKET || "/var/run/docker.sock",
  dockerTlsVerify: process.env.DOCKER_TLS_VERIFY === "1",
  dockerCertPath: process.env.DOCKER_CERT_PATH || "",
  dockerSshKey: process.env.DOCKER_SSH_KEY || "",

  // Image used for spawned DF instances. Match what you built/deployed.
  dfImage: process.env.DF_IMAGE || "remote-df:df-53_14",

  // Where the panel stores uploaded mods/tilesets (local to THIS container).
  // No host-path coupling: assets are streamed into instances over the Docker
  // API, and saves/backups use named volumes — so this works with a remote
  // daemon too.
  dataRoot: process.env.DATA_ROOT || "/data",

  basePort: Number(process.env.BASE_PORT || 6090),
  dfCpus: process.env.DF_CPUS || "2.0",
  dfMemory: process.env.DF_MEMORY || "3g",
} as const;

// DF v50 paths inside the game container (see the main project's Dockerfile).
export const CONTAINER_SAVE_DIR =
  "/root/.local/share/Bay 12 Games/Dwarf Fortress/save";
export const CONTAINER_BACKUP_DIR = "/backups";
// Where uploaded mods/tilesets are injected. DF v50 reads installed mods from
// the XDG mods dir. Adjust per edition/version if needed.
export const CONTAINER_MODS_DIR =
  "/root/.local/share/Bay 12 Games/Dwarf Fortress/mods";

// Labels used to recognise and describe panel-managed containers.
export const LABELS = {
  managed: "remote-df.managed",
  instance: "remote-df.instance",
  webPort: "remote-df.webPort",
  edition: "remote-df.edition",
} as const;

// Parse "3g" / "512m" / "2048" into bytes for the Docker API.
export function memoryToBytes(mem: string): number {
  const m = /^(\d+(?:\.\d+)?)\s*([gmk]?)b?$/i.exec(mem.trim());
  if (!m) return 0;
  const n = parseFloat(m[1]);
  const unit = m[2].toLowerCase();
  const mult =
    unit === "g" ? 1024 ** 3 : unit === "m" ? 1024 ** 2 : unit === "k" ? 1024 : 1;
  return Math.round(n * mult);
}
