# remote-df — Dwarf Fortress in the Browser

Play [Dwarf Fortress](https://www.bay12games.com/dwarves/) (Classic or Steam edition)
in a web browser with audio. DF runs as a Docker container on a remote x86-64 Linux
host at full native speed, streamed to your browser over noVNC with audio via HTTP.

| Classic | Steam (Premium) |
| --- | --- |
| ![Classic title](docs/screenshots/classic-1.png) | ![Steam title](docs/screenshots/steam-1.png) |
| ![Classic gameplay](docs/screenshots/classic-2.png) | ![Steam gameplay](docs/screenshots/steam-2.png) |

## Architecture

```
Your machine                         Remote x86-64 Linux host (ssh <remote>)
┌──────────────────┐                 ┌──────────────────────────────────────────────────┐
│ Browser          │                 │ Docker container                                  │
│  noVNC <canvas> ─┼── SSH tunnel ──▶│  websockify :6080 ─ Xvnc :5900                   │
│  localhost:6080  │   (loopback)    │     └─ Xvnc :99 ◀─ dwarfort (PRINT_MODE:2D)      │
│                  │                 │  PulseAudio (virtual sink)                        │
│  <audio> ────────┼── SSH tunnel ──▶│     └─ ffmpeg Opus/WebM :8080                    │
│  localhost:8080  │                 │  saves → docker volume df_saves                   │
└──────────────────┘                 └──────────────────────────────────────────────────┘
```

Nothing is exposed publicly: the container binds to `127.0.0.1`, and you reach it
through an SSH tunnel.

## Prerequisites

- A remote x86-64 Linux host you can SSH into (e.g. a VPS or cloud instance)
- Docker installed on that host
- SSH client on your local machine
- A modern web browser

## Quickstart (Classic Edition)

```bash
# 1. Deploy — pulls the pre-built image from GHCR and starts the container
./scripts/deploy.sh <ssh-host>

# 2. Open an SSH tunnel and launch it in your browser
./scripts/connect.sh <ssh-host>
#    → http://localhost:6080/vnc.html?autoconnect=1&resize=scale
#    → Audio stream: http://localhost:8080
```

## Steam Edition

If you own Dwarf Fortress on Steam, you can use the premium version instead:

```bash
# Build on the remote host (SteamCMD needs native x86_64)
DF_EDITION=steam STEAM_USER=myuser STEAM_PASS=mypass ./scripts/deploy.sh <ssh-host>

# With Steam Guard 2FA:
DF_EDITION=steam STEAM_USER=myuser STEAM_PASS=mypass STEAM_GUARD=ABC123 ./scripts/deploy.sh <ssh-host>
```

Steam credentials are passed as Docker BuildKit secrets and never stored in the image.

## DFHack

The classic edition includes [DFHack](https://github.com/DFHack/dfhack) (mod framework).
DFHack is loaded via `LD_PRELOAD` to bypass the `setarch` call that requires
`SYS_ADMIN` capability unavailable in Docker containers. The steam edition does not
include DFHack.

## CI / GitHub Actions

| Workflow                                               | Trigger        | Description                                                    |
| ------------------------------------------------------ | -------------- | -------------------------------------------------------------- |
| [`build.yml`](.github/workflows/build.yml)             | Push to `main` | Builds classic edition, pushes to GHCR                         |
| [`build-steam.yml`](.github/workflows/build-steam.yml) | Manual         | Builds steam edition (needs `STEAM_USER`/`STEAM_PASS` secrets) |
| [`deploy.yml`](.github/workflows/deploy.yml)           | Manual         | Deploys to a remote host via SSH (`DEPLOY_SSH_KEY` secret)     |

Images are published to `ghcr.io/sessa93/remote-df` with tags:

- `df-{VERSION}-classic`, `classic`, `latest` (classic)
- `df-{VERSION}-steam`, `steam` (steam)

## Project Layout

| Path                                             | Purpose                                                                          |
| ------------------------------------------------ | -------------------------------------------------------------------------------- |
| [`docker/Dockerfile`](docker/Dockerfile)         | Multi-stage amd64 image: custom SDL2 + DF + audio + Xvnc + noVNC                 |
| [`docker/start.sh`](docker/start.sh)             | Entrypoint: PulseAudio, ffmpeg audio stream, display stack, DF with auto-restart |
| [`scripts/deploy.sh`](scripts/deploy.sh)         | Deploy to remote host (classic: pull from GHCR; steam: build on remote)          |
| [`scripts/remote-run.sh`](scripts/remote-run.sh) | `docker run` with saves volume + restart policy (runs on the remote)             |
| [`scripts/connect.sh`](scripts/connect.sh)       | SSH tunnel (VNC + audio) + open browser (run from your machine)                  |
| [`df/g_src/`](df/g_src/)                         | Open-source platform/render wrapper (from Bay 12)                                |

## How It Works

`dwarfort` is a graphical SDL2 program, so the container gives it a headless
display: **Xvnc** (virtual X server + VNC, 1280×800) → DF renders into it using
`PRINT_MODE:2D` software rendering (no GPU needed) → **websockify/noVNC** serves
the VNC stream to the browser as a `<canvas>`. Keyboard and mouse flow back the
same way.

### Audio Streaming

A **PulseAudio** virtual null sink captures DF's audio output (via `SDL_AUDIODRIVER=pulse`).
**ffmpeg** reads from the PulseAudio monitor source, encodes to Opus/WebM at 96kbps,
and serves it as an HTTP stream on port 8080. Latency is ~100-200ms.

### Custom SDL2 Build

DF's bundled SDL2 reads mouse input via XInput2 raw events, which VNC-injected
input does not produce — the cursor would never register. The Dockerfile builds
SDL2 with `SDL_X11_XINPUT=OFF` so DF uses core X input instead, which VNC input
generates correctly.

### Persistent Saves

Saves persist in the `df_saves` Docker volume (mounted at `/opt/df/data/save`),
so worlds and fortresses survive redeploys.

## Configuration

| Variable     | Default    | Description                                      |
| ------------ | ---------- | ------------------------------------------------ |
| `GEOM`       | `1280x800` | Virtual display resolution                       |
| `VNC_PORT`   | `5900`     | VNC server port                                  |
| `WEB_PORT`   | `6080`     | noVNC web port                                   |
| `AUDIO_PORT` | `8080`     | Audio stream port                                |
| `DF_VERSION` | `53_14`    | DF version (used in image tags and download URL) |
| `DF_EDITION` | `classic`  | `classic` or `steam`                             |

## Security

The setup assumes a single user reaching it over an SSH tunnel, so the VNC server
runs with **no password** and there's **no TLS** — which is fine over loopback +
SSH. Do **not** publish the port directly. If you ever want others to reach it:

1. Add a VNC password (`x11vnc -rfbauth`)
2. Terminate TLS in front (e.g. Caddy or nginx)
3. Open the firewall deliberately

## License

This project's scripts, Dockerfile, and configuration are released under the
[MIT License](LICENSE).

**Dwarf Fortress** itself is copyright Tarn Adams / Bay 12 Games. The game binary
and assets are not included in this repository — they are downloaded at build time.
See [Bay 12's site](https://www.bay12games.com/dwarves/) for terms.
