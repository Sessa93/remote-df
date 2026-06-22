# remote-df — Dwarf Fortress in the Browser

Play [Dwarf Fortress](https://www.bay12games.com/dwarves/) (Classic or Steam) in
your browser. DF runs as a Docker container on a remote x86-64 Linux host and
streams to you over noVNC, with audio. Nothing is exposed publicly — the
container binds to `127.0.0.1` and you reach it through an SSH tunnel.

| Classic                                             | Steam (Premium)                                 |
| --------------------------------------------------- | ----------------------------------------------- |
| ![Classic title](docs/screenshots/classic-1.png)    | ![Steam title](docs/screenshots/steam-1.png)    |
| ![Classic gameplay](docs/screenshots/classic-2.png) | ![Steam gameplay](docs/screenshots/steam-2.png) |

## Quickstart

You need an x86-64 Linux host with Docker that you can SSH into.

```bash
./scripts/deploy.sh <ssh-host>    # build + start on the remote
./scripts/connect.sh <ssh-host>   # open an SSH tunnel, then visit:
#   http://localhost:6080/
```

## Steam edition

If you own DF on Steam (credentials are passed as build-time secrets, never
stored in the image):

```bash
DF_EDITION=steam STEAM_USER=you STEAM_PASS=pw ./scripts/deploy.sh <ssh-host>
# add STEAM_GUARD=CODE if you use 2FA
```

## Features

- Browser play over noVNC with audio (Ogg/Opus via Icecast at `/audio`).
- Saves on disk (`./saves`) + periodic backups (`./backups`); browse them at
  `/saves`, `/backups`, and view logs at `/logs`.
- Idle auto-pause: DF is paused when nobody's connected (`DF_AUTOPAUSE=0` to
  keep it running).
- Healthcheck + CPU/memory limits.
- Classic edition includes [DFHack](https://github.com/DFHack/dfhack).

## Configuration

Set via the environment or a `.env` file on the host. Full list (ports, backup
interval/retention, idle grace) is in [`docker-compose.yml`](docker-compose.yml).

| Variable                | Default      | Description                    |
| ----------------------- | ------------ | ------------------------------ |
| `GEOM`                  | `1280x800`   | Display resolution             |
| `WEB_PORT`              | `6080`       | Browser port (tunneled)        |
| `DF_VERSION`            | `53_14`      | DF version                     |
| `DF_EDITION`            | `classic`    | `classic` or `steam`           |
| `DF_SAVES_DIR`          | `./saves`    | Where saves live on disk       |
| `DF_AUTOPAUSE`          | `1`          | Pause DF when idle (`0` = off) |
| `DF_CPUS` / `DF_MEMORY` | `2.0` / `3g` | Container resource limits      |

## Security

Single user over an SSH tunnel: the VNC server has no password and no TLS, which
is fine over loopback. Do **not** expose the port publicly.

## License

Project scripts, Dockerfile, and config: [MIT](LICENSE). **Dwarf Fortress** is
© Tarn Adams / Bay 12 Games and is downloaded at build time, not included here.
