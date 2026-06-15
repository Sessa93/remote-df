#!/usr/bin/env bash
# Run ON the remote Linux host. (Re)starts the DF container with persistent
# saves, bound to loopback only (reach it via an SSH tunnel — see connect.sh).
set -euo pipefail

NAME="${NAME:-df}"
IMAGE="${IMAGE:-remote-df:native}"
WEB_PORT="${WEB_PORT:-6080}"
VNC_PORT="${VNC_PORT:-5900}"

docker rm -f "$NAME" 2>/dev/null || true
docker run -d --name "$NAME" \
  --restart unless-stopped \
  -p "127.0.0.1:${WEB_PORT}:6080" \
  -p "127.0.0.1:${VNC_PORT}:5900" \
  -v df_saves:/opt/df/data/save \
  "$IMAGE"

echo "DF container '$NAME' is up on 127.0.0.1:${WEB_PORT} (saves persist in volume df_saves)."
echo "It is NOT exposed publicly. Tunnel from your machine to reach it."
