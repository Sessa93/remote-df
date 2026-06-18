# remote-df control panel

A Next.js **sidecar** that turns a single Docker host into a small Dwarf Fortress
hosting panel. It talks to the host Docker daemon to **spawn and manage DF
containers**, lets you **upload mods and tilesets** and attach them per instance,
and surfaces the **SSH tunnel** command to reach each instance.

> Status: MVP foundation. It **type-checks and `next build` succeeds**, but it
> has **not yet been exercised against a live Docker daemon** — treat the first
> deploy as a smoke test. See *Limitations* below.

## How it works

```text
Browser ──SSH tunnel──▶ control-panel :7070 ─┬─ Docker API (host socket) ─▶ spawns df-<name> containers
                                             │       each bound to 127.0.0.1:<port> (6090, 6091, …)
                                             └─ ./data ── instances/<name>/{saves,backups}
                                                          mods/<name>/ , tilesets/<name>/  (mounted read-only)
```

- **Instances** are plain `remote-df` containers, labelled `remote-df.managed=true`
  and named `df-<name>`. The panel lists them, and can spawn/start/stop/remove and
  tail logs. Each gets the next free loopback port from `BASE_PORT`.
- **Mods/tilesets** are uploaded as `.zip` (extracted) or single files into
  `./data/mods/<name>` and `./data/tilesets/<name>`, and bind-mounted read-only
  into the chosen instances under DF's mods dir.
- **Saves** persist per instance under `./data/instances/<name>/saves` (the DF v50
  XDG save path), with backups under `.../backups`.

## Run it

On the Docker host:

```bash
cd control-panel
cp .env.example .env
# Edit .env — set HOST_DATA_ROOT to the ABSOLUTE host path of ./data, e.g.:
#   HOST_DATA_ROOT=/home/ubuntu/remote-df/control-panel/data
docker compose up -d --build
```

From your machine:

```bash
ssh -N -L 7070:localhost:7070 <ssh-host>   # then open http://localhost:7070
```

Spawn an instance in the UI; it shows the per-instance tunnel command
(`ssh -N -L <port>:localhost:<port> <host>`) and URL.

### The `HOST_DATA_ROOT` gotcha

The panel runs in a container but asks the **host** daemon to create new
containers. Bind-mount *sources* in those requests are resolved by the host, not
inside the panel. So the panel must hand Docker **host paths**. `DATA_ROOT`
(`/data`) is where the panel reads/writes; `HOST_DATA_ROOT` is that same
directory's path on the host, used to build the spawned containers' bind specs.
Get this wrong and instances start with empty/wrong save dirs.

## Configuration

| Variable         | Default              | Description                                       |
| ---------------- | -------------------- | ------------------------------------------------- |
| `PANEL_PORT`     | `7070`               | Loopback port the panel listens on                |
| `DF_IMAGE`       | `remote-df:df-53_14` | Image used for spawned instances                  |
| `DATA_ROOT`      | `/data`              | Data dir path inside the panel container          |
| `HOST_DATA_ROOT` | — (required)         | Same dir's absolute path on the host              |
| `BASE_PORT`      | `6090`               | First loopback port handed to an instance         |
| `DF_CPUS`        | `2.0`                | CPU limit per spawned instance                    |
| `DF_MEMORY`      | `3g`                 | Memory limit per spawned instance                 |

## Security

Mounting `/var/run/docker.sock` grants **root-equivalent** control of the host.
Keep the panel **loopback-only** and reach it over SSH (as above). Do not expose
it publicly without putting authentication + TLS in front.

## Limitations / follow-ups

- **Not yet runtime-verified.** Needs `npm install` + a Docker build on an
  amd64 host with the `remote-df` image present.
- **Mod mount path** (`CONTAINER_MODS_DIR` in `src/lib/config.ts`) targets DF
  v50's XDG mods dir; confirm it matches your edition and adjust if mods don't
  load.
- **Tunneling is per-port**, matching the main project's SSH model — the panel
  shows the command but does not yet proxy instances through itself (a future
  reverse-proxy/auth layer could give one URL for everything).
- No authentication in the panel itself yet (relies on the SSH tunnel boundary).
- DF audio fan-out, health, and auto-pause come from the base image — the panel
  passes `DF_AUTOPAUSE` and inherits the rest.
