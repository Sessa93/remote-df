#!/usr/bin/env bash
# Boot the display stack, then Dwarf Fortress.
#
# We use TigerVNC's Xvnc (a real X server with integrated VNC) for display+VNC.
# The SDL2/XInput2 input problem (cursor never registers over VNC) is handled in
# the Dockerfile by shadowing libXi for DF (see there); no X-server flag works
# because Xvnc refuses to disable the XInput extension at runtime.
#
# DF is auto-restarted if it exits/crashes (a streamed instance should return
# to the title, not die).
set -u

export DISPLAY=:99
# Geometry must be >= DF's window or the bottom clips; matchbox maximizes it.
GEOM="${GEOM:-1280x800}"
VNC_PORT="${VNC_PORT:-5900}"
WEB_PORT="${WEB_PORT:-6080}"
mkdir -p /var/log/df

echo "[start] Xvnc ${GEOM} on :99 (rfb :$VNC_PORT)"
Xvnc :99 -geometry "$GEOM" -depth 24 \
     -SecurityTypes None -AlwaysShared -rfbport "$VNC_PORT" \
     -desktop DwarfFortress >/var/log/df/xvnc.log 2>&1 &

# Wait for the X server to accept connections.
for _ in $(seq 1 100); do
  xdpyinfo -display :99 >/dev/null 2>&1 && break
  sleep 0.1
done
if ! xdpyinfo -display :99 >/dev/null 2>&1; then
  echo "[start] ERROR: Xvnc did not come up"; cat /var/log/df/xvnc.log || true
fi

echo "[start] keep keyboard focus on the DF window (no reparenting WM)"
( while true; do
    WID=$(DISPLAY=:99 xdotool search --name "Dwarf Fortress" 2>/dev/null | head -1)
    [ -n "$WID" ] && DISPLAY=:99 xdotool windowfocus "$WID" 2>/dev/null
    sleep 2
  done ) >/var/log/df/focus.log 2>&1 &

echo "[start] noVNC/websockify on :$WEB_PORT -> localhost:$VNC_PORT"
websockify --web /usr/share/novnc "$WEB_PORT" "localhost:$VNC_PORT" \
       >/var/log/df/websockify.log 2>&1 &

echo "[start] launching Dwarf Fortress via DFHack (PRINT_MODE:2D, SOUND:NO); auto-restart on exit"
cd /opt/df
(
  while true; do
    # Load DFHack via LD_PRELOAD directly, bypassing the dfhack launcher
    # script whose setarch call fails in Docker (no SYS_ADMIN capability).
    LD_PRELOAD=./hack/libdfhack.so \
    LD_LIBRARY_PATH=/opt/df:./hack/libs:./hack \
      ./dwarfort >>/var/log/df/df.log 2>&1
    echo "[start] !!! dwarfort+dfhack exited rc=$? — restarting in 2s" >>/var/log/df/df.log
    sleep 2
  done
) &

exec tail -F /var/log/df/df.log /var/log/df/xvnc.log 2>/dev/null
