# remote-df — Dwarf Fortress in the Browser

Play the classic (ASCII/2D) Linux build of [Dwarf Fortress](https://www.bay12games.com/dwarves/)
in a web browser. DF runs as a Docker container on a remote x86-64 Linux host at
full native speed and is streamed to your browser over noVNC.

## Architecture

```
Your machine                         Remote x86-64 Linux host (ssh <remote>)
┌──────────────────┐                 ┌─────────────────────────────────────────────┐
│ Browser          │                 │ Docker container  remote-df:native           │
│  noVNC <canvas> ─┼── SSH tunnel ──▶│  websockify :6080 ─ Xvnc :5900              │
│  localhost:6080  │   (loopback)    │     └─ Xvnc :99 ◀─ dwarfort (PRINT_MODE:2D) │
└──────────────────┘                 │        saves → docker volume df_saves        │
                                     └─────────────────────────────────────────────┘
```

Nothing is exposed publicly: the container binds to `127.0.0.1`, and you reach it
through an SSH tunnel.

## Prerequisites

- A remote x86-64 Linux host you can SSH into (e.g. a VPS or cloud instance)
- Docker installed on that host
- SSH client on your local machine
- A modern web browser

## Quickstart

```bash
# 1. Build the image on the remote and start the container (idempotent)
./scripts/deploy.sh <ssh-host>

# 2. Open an SSH tunnel and launch it in your browser
./scripts/connect.sh <ssh-host>
#    → http://localhost:6080/vnc.html?autoconnect=1&resize=scale
```

`deploy.sh` downloads the DF tarball on the remote on first run (so it doesn't
upload ~80 MB), syncs the build files, builds the Docker image, and runs the
container. Re-run it anytime to redeploy.

## Project Layout

| Path                                             | Purpose                                                              |
| ------------------------------------------------ | -------------------------------------------------------------------- |
| [`docker/Dockerfile`](docker/Dockerfile)         | Multi-stage amd64 image: custom SDL2 + DF + Xvnc + noVNC             |
| [`docker/start.sh`](docker/start.sh)             | Container entrypoint: boots display stack, runs DF with auto-restart |
| [`scripts/deploy.sh`](scripts/deploy.sh)         | Build + run on the remote host (run from your machine)               |
| [`scripts/remote-run.sh`](scripts/remote-run.sh) | `docker run` with saves volume + restart policy (runs on the remote) |
| [`scripts/connect.sh`](scripts/connect.sh)       | SSH tunnel + open browser (run from your machine)                    |
| [`df/g_src/`](df/g_src/)                         | Open-source platform/render wrapper (from Bay 12)                    |
| [`df/prefs/init.txt`](df/prefs/init.txt)         | Runtime overrides: 2D software render, no sound, FPS caps            |

## How It Works

`dwarfort` is a graphical SDL2 program, so the container gives it a headless
display: **Xvnc** (virtual X server + VNC, 1280×800) → DF renders into it using
`PRINT_MODE:2D` software rendering (no GPU needed) → **websockify/noVNC** serves
the VNC stream to the browser as a `<canvas>`. Keyboard and mouse flow back the
same way. Sound is disabled.

DF is wrapped in a restart loop so quitting or crashing returns to the title
instead of killing the container.

### Custom SDL2 Build

DF's bundled SDL2 reads mouse input via XInput2 raw events, which VNC-injected
input does not produce — the cursor would never register. The Dockerfile builds
SDL2 with `SDL_X11_XINPUT=OFF` so DF uses core X input instead, which VNC input
generates correctly.

### Persistent Saves

Saves persist in the `df_saves` Docker volume (mounted at `/opt/df/data/save`),
so worlds and fortresses survive redeploys.

## Configuration

Environment variables for customization:

| Variable   | Default             | Description                       |
| ---------- | ------------------- | --------------------------------- |
| `GEOM`     | `1280x800`          | Virtual display resolution        |
| `VNC_PORT` | `5900`              | VNC server port                   |
| `WEB_PORT` | `6080`              | noVNC web port                    |
| `DF_URL`   | _(bay12games link)_ | DF download URL (for `deploy.sh`) |

## Why Not WebAssembly?

The DF engine ([`df/dwarfort`](df/)) is a **closed-source, stripped x86-64 ELF**;
only the platform/render wrapper ([`df/g_src/`](df/g_src/)) is open. WASM
compilation (Emscripten) needs source we don't have. The only WASM route would be
emulating an x86-64 machine _in the browser_ (container2wasm / qemu-wasm) — but
those only expose a serial terminal today, and running DF under emulation would be
a slideshow. Running natively on a real Linux host and streaming is the only way
to get smooth, graphical DF in a browser tab.

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
and assets are not included in this repository — they are downloaded at deploy
time. See [Bay 12's site](https://www.bay12games.com/dwarves/) and
[`df/licenses/`](df/licenses/) for redistribution terms.
