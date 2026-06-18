import "server-only";
import Docker from "dockerode";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config";

// Build a dockerode client from the configured connection. Supports the local
// socket, TCP (optionally TLS), and SSH — mirroring the docker CLI's env vars.
function build(): Docker {
  const host = config.dockerHost.trim();

  // Local socket (default) or explicit unix:// path.
  if (!host || host.startsWith("unix://")) {
    const socketPath = host ? host.replace(/^unix:\/\//, "") : config.dockerSocket;
    return new Docker({ socketPath });
  }

  const url = new URL(host);

  // TCP, with optional TLS (DOCKER_TLS_VERIFY=1 + DOCKER_CERT_PATH).
  if (url.protocol === "tcp:" || url.protocol === "http:" || url.protocol === "https:") {
    const tls = config.dockerTlsVerify || url.protocol === "https:";
    const opts: Docker.DockerOptions = {
      host: url.hostname,
      port: Number(url.port) || (tls ? 2376 : 2375),
      protocol: tls ? "https" : "http",
    };
    if (tls) {
      const dir = config.dockerCertPath;
      if (!dir) throw new Error("DOCKER_TLS_VERIFY=1 requires DOCKER_CERT_PATH");
      opts.ca = fs.readFileSync(path.join(dir, "ca.pem"));
      opts.cert = fs.readFileSync(path.join(dir, "cert.pem"));
      opts.key = fs.readFileSync(path.join(dir, "key.pem"));
    }
    return new Docker(opts);
  }

  // SSH to a remote daemon. Auth via an explicit key file or an SSH agent.
  if (url.protocol === "ssh:") {
    const sshOptions: Record<string, unknown> = {};
    if (config.dockerSshKey) {
      sshOptions.privateKey = fs.readFileSync(config.dockerSshKey);
    } else if (process.env.SSH_AUTH_SOCK) {
      sshOptions.agent = process.env.SSH_AUTH_SOCK;
    } else {
      throw new Error(
        "ssh:// DOCKER_HOST needs DOCKER_SSH_KEY or an SSH agent (SSH_AUTH_SOCK)",
      );
    }
    // dockerode/docker-modem speak SSH via ssh2 when protocol is "ssh".
    return new Docker({
      protocol: "ssh",
      host: url.hostname,
      port: Number(url.port) || 22,
      username: url.username || process.env.USER || "root",
      sshOptions,
    } as Docker.DockerOptions);
  }

  throw new Error(`Unsupported DOCKER_HOST protocol: ${url.protocol}`);
}

let client: Docker | null = null;

// Lazily construct so config errors surface on first use (per request), not at
// module load — keeps the UI able to render an error instead of crashing.
export function docker(): Docker {
  if (!client) client = build();
  return client;
}

// A short human description of where we're deploying, for the UI.
export function dockerTarget(): string {
  return config.dockerHost || `unix://${config.dockerSocket}`;
}
