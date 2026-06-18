# remote-df control panel

A Next.js **sidecar** that turns a Docker host — **local or remote** — into a
small Dwarf Fortress hosting panel. It connects to a Docker daemon to **spawn and
manage DF containers**, lets you **upload mods and tilesets** and attach them per
instance, and surfaces the **SSH tunnel** command to reach each instance.

> Status: MVP foundation. It **type-checks and `next build` succeeds**, but it
> has **not yet been exercised against a live Docker daemon** — treat the first
> deploy as a smoke test. See *Limitations* below.

## How it works

```text
Browser ─SSH tunnel─▶ control-panel :7070 ─┬─ Docker API ─▶ spawns df-<name> on the target daemon
                                           │   (local socket, tcp+TLS, or ssh)   bound to 127.0.0.1:<port>
                                           ├─ saves/backups → named volumes on the daemon host
                                           └─ ./data/{mods,tilesets} → streamed into instances (Docker API)
```

- **Instances** are plain `remote-df` containers, labelled `remote-df.managed=true`
  and named `df-<name>`. The panel lists them, and can spawn/start/stop/remove and
  tail logs. Each gets the next free loopback port from `BASE_PORT` **on the target
  daemon's host**.
- **Saves & backups** use **named volumes** (`df-<name>-saves`, `df-<name>-backups`),
  managed by the target daemon — so they persist on whichever host runs the
  container, local or remote. Re-spawning the same name reuses the fort.
- **Mods/tilesets** are uploaded as `.zip` (extracted) or single files into
  `./data/mods/<name>` / `./data/tilesets/<name>`, then **streamed into the
  container over the Docker API** (`putArchive`) at spawn — no host-path coupling,
  so it works against a remote daemon too.

## Connecting to a daemon

Set `DOCKER_HOST` (mirrors the docker CLI). Leave it empty for the local socket.

| `DOCKER_HOST`          | Auth                                               |
| ---------------------- | -------------------------------------------------- |
| *(empty)*              | Local `/var/run/docker.sock` (mounted in compose)  |
| `tcp://host:2376`      | TLS via `DOCKER_TLS_VERIFY=1` + `DOCKER_CERT_PATH` |
| `ssh://user@host[:22]` | `DOCKER_SSH_KEY` file, or an SSH agent             |

The `DF_IMAGE` must exist **on the target daemon's host** (build/pull it there).

## Run it

```bash
cd control-panel
cp .env.example .env
# Edit .env: leave DOCKER_HOST empty for local, or point it at a remote daemon.
docker compose up -d --build
```

From your machine:

```bash
ssh -N -L 7070:localhost:7070 <panel-host>   # then open http://localhost:7070
```

Spawn an instance; its card shows the per-instance tunnel command
(`ssh -N -L <port>:localhost:<port> <daemon-host>`) and URL. Note the instance
port lives on the **daemon's** host, which may differ from the panel's host when
using a remote daemon.

## Configuration

| Variable            | Default              | Description                                        |
| ------------------- | -------------------- | -------------------------------------------------- |
| `PANEL_PORT`        | `7070`               | Loopback port the panel listens on                 |
| `DOCKER_HOST`       | *(local socket)*     | Target daemon - see Connecting to a daemon         |
| `DOCKER_TLS_VERIFY` | -                    | `1` to enable TLS for `tcp://`                     |
| `DOCKER_CERT_PATH`  | -                    | Dir with `ca.pem`/`cert.pem`/`key.pem` (TLS)       |
| `DOCKER_SSH_KEY`    | -                    | Private key path for `ssh://` (or SSH agent)       |
| `DF_IMAGE`          | `remote-df:df-53_14` | Image for spawned instances (must exist on target) |
| `DATA_ROOT`         | `/data`              | Where the panel stores uploaded mods/tilesets      |
| `BASE_PORT`         | `6090`               | First loopback port handed to an instance          |
| `DF_CPUS`           | `2.0`                | CPU limit per spawned instance                     |
| `DF_MEMORY`         | `3g`                 | Memory limit per spawned instance                  |

## Security

A Docker connection — socket, `tcp://`, or `ssh://` — is **root-equivalent** on
the target host. Keep the panel **loopback-only** and reach it over SSH. Do not
expose it publicly without authentication + TLS in front. Prefer TLS or SSH over
an unauthenticated `tcp://` daemon.

## Limitations / follow-ups

- **Not yet runtime-verified** against a live daemon — needs a deploy to confirm.
- **Mod mount path** (`CONTAINER_MODS_DIR` in `src/lib/config.ts`) targets DF
  v50's XDG mods dir; confirm it matches your edition. Mods are injected at spawn,
  so newly-attached mods apply to worlds created after launch.
- **Tunneling is per-port**, matching the main project's SSH model — the panel
  shows the command but does not yet proxy instances through itself (a future
  reverse-proxy/auth layer could give one URL for everything).
- **Removing an instance keeps its volumes** (saves), so re-spawning restores it;
  there's no "delete saves too" option yet.
- No authentication in the panel itself yet (relies on the SSH tunnel boundary).
