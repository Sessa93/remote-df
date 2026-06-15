#!/usr/bin/env bash
# Boot the display stack, audio streaming, then Dwarf Fortress.
#
# We use TigerVNC's Xvnc (a real X server with integrated VNC) for display+VNC.
# The SDL2/XInput2 input problem (cursor never registers over VNC) is handled in
# the Dockerfile by shadowing libXi for DF (see there); no X-server flag works
# because Xvnc refuses to disable the XInput extension at runtime.
#
# Audio: PulseAudio virtual sink -> ffmpeg Opus encode -> HTTP stream on :8080.
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

# --- PulseAudio virtual sink ------------------------------------------------
echo "[start] PulseAudio (virtual sink, no hardware needed)"
export XDG_RUNTIME_DIR=/tmp/pulse-runtime
mkdir -p "$XDG_RUNTIME_DIR"
# Minimal PulseAudio config: null sink (no real audio device), TCP disabled.
pulseaudio --daemonize --exit-idle-time=-1 \
  --load="module-null-sink sink_name=virtual_out sink_properties=device.description=VirtualOutput" \
  --load="module-always-sink" \
  >/var/log/df/pulse.log 2>&1 || true
# Wait for PulseAudio to come up.
for _ in $(seq 1 50); do
  pactl info >/dev/null 2>&1 && break
  sleep 0.1
done
# Set the virtual sink as default so SDL/fmod use it.
pactl set-default-sink virtual_out 2>/dev/null || true

# --- Audio stream via ffmpeg ------------------------------------------------
# Ogg/Opus: best cross-browser support (works in Firefox, Chrome, Edge).
# ffmpeg serves on internal :8080; nginx proxies it at /audio.
echo "[start] audio stream (Ogg/Opus via ffmpeg on internal :8080)"
ffmpeg -nostdin -f pulse -i virtual_out.monitor \
  -ac 2 -b:a 96k -c:a libopus -f ogg \
  -page_duration 200000 \
  -content_type audio/ogg \
  -listen 1 -multiple_requests 1 \
  "http://0.0.0.0:8080" \
  >/var/log/df/audio.log 2>&1 &

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

echo "[start] noVNC/websockify on internal :6081 -> localhost:$VNC_PORT"
websockify 6081 "localhost:$VNC_PORT" \
       >/var/log/df/websockify.log 2>&1 &

echo "[start] nginx on :$WEB_PORT (noVNC + audio unified)"
nginx -g 'daemon off;' >/var/log/df/nginx.log 2>&1 &

echo "[start] launching Dwarf Fortress (PRINT_MODE:2D, SOUND:YES); auto-restart on exit"
cd /opt/df
EDITION=$(cat /opt/df/.edition 2>/dev/null || echo classic)
(
  while true; do
    if [ "$EDITION" = "classic" ] && [ -f ./hack/libdfhack.so ]; then
      # Load DFHack via LD_PRELOAD directly, bypassing the dfhack launcher
      # script whose setarch call fails in Docker (no SYS_ADMIN capability).
      LD_PRELOAD=./hack/libdfhack.so \
      LD_LIBRARY_PATH=/opt/df:./hack/libs:./hack \
        ./dwarfort >>/var/log/df/df.log 2>&1
    else
      LD_LIBRARY_PATH=/opt/df ./dwarfort >>/var/log/df/df.log 2>&1
    fi
    echo "[start] !!! dwarfort exited rc=$? — restarting in 2s" >>/var/log/df/df.log
    sleep 2
  done
) &

exec tail -F /var/log/df/df.log /var/log/df/xvnc.log /var/log/df/audio.log /var/log/df/nginx.log 2>/dev/null
