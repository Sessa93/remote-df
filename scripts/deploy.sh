#!/usr/bin/env bash
# Run on your LOCAL machine. Syncs build files to the remote host, (re)builds
# the image natively there, and starts the container. DF assets (df/) are
# fetched on the remote on first run so we don't upload ~80MB.
set -euo pipefail

if [ -z "${1:-}" ]; then
  echo "Usage: $0 <ssh-host>" >&2
  exit 1
fi
REMOTE="$1"
DF_VERSION="${DF_VERSION:-53_14}"
HERE="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> Ensuring dirs on $REMOTE"
ssh "$REMOTE" "mkdir -p ~/remote-df/docker ~/remote-df/scripts"

echo "==> Syncing build files"
scp -q "$HERE/docker/Dockerfile" "$REMOTE:~/remote-df/docker/Dockerfile"
scp -q "$HERE/docker/start.sh"   "$REMOTE:~/remote-df/docker/start.sh"
scp -q "$HERE/.dockerignore"     "$REMOTE:~/remote-df/.dockerignore"
scp -q "$HERE/scripts/remote-run.sh" "$REMOTE:~/remote-df/scripts/remote-run.sh"

echo "==> Building image natively on $REMOTE (DF $DF_VERSION)"
ssh "$REMOTE" "cd ~/remote-df && docker build --build-arg DF_VERSION=$DF_VERSION -f docker/Dockerfile -t remote-df:df-$DF_VERSION ."

echo "==> Starting container on $REMOTE"
ssh "$REMOTE" "DF_VERSION=$DF_VERSION bash ~/remote-df/scripts/remote-run.sh"

echo "==> Done. Run ./scripts/connect.sh to tunnel + open it."
