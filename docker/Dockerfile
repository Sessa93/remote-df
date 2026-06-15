# Native amd64 image for Dwarf Fortress (Classic build).
#
# The DF engine (dwarfort) is a closed-source x86-64 ELF. This image runs it
# natively on amd64 Linux, renders through TigerVNC's Xvnc (software SDL2), and
# streams the display over noVNC. Build/run on an amd64 host.

# --- stage 1: build SDL2 with XInput2 compiled out -------------------------
# DF's SDL2 reads the mouse via XInput2 *raw* events, which VNC-injected input
# does not produce — so the cursor never registers and clicks/keys are ignored
# (libsdl-org/SDL#8827, ocornut/imgui#7217). There is no runtime switch for
# this, so we build SDL2 with SDL_X11_XINPUT=OFF: it then uses core X input,
# which VNC input DOES generate. DF loads it via LD_LIBRARY_PATH=/opt/df.
FROM debian:bookworm-slim AS sdlbuild
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential cmake ca-certificates curl pkg-config \
      libx11-dev libxext-dev libxcursor-dev libxrandr-dev libxfixes-dev \
      libxi-dev libxss-dev libxkbcommon-dev libgl1-mesa-dev \
    && rm -rf /var/lib/apt/lists/*
ARG SDL2_VER=2.30.9
RUN curl -fsSL "https://github.com/libsdl-org/SDL/releases/download/release-${SDL2_VER}/SDL2-${SDL2_VER}.tar.gz" -o /tmp/sdl.tgz \
    && tar -xzf /tmp/sdl.tgz -C /tmp \
    && cmake -S "/tmp/SDL2-${SDL2_VER}" -B /tmp/b -DCMAKE_BUILD_TYPE=Release \
         -DSDL_X11_XINPUT=OFF -DSDL_SHARED=ON -DSDL_STATIC=OFF -DSDL_TEST=OFF \
    && cmake --build /tmp/b -j"$(nproc)" \
    && cmake --install /tmp/b --prefix /sdl \
    && cp -L /sdl/lib/libSDL2-2.0.so.0 /sdl/libSDL2-2.0.so.0

# --- stage 2: runtime ------------------------------------------------------
FROM debian:bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
      libsdl2-2.0-0 libsdl2-image-2.0-0 \
      libgl1 libglu1-mesa libgl1-mesa-dri \
      tigervnc-standalone-server tigervnc-common x11-utils x11-apps \
      websockify novnc \
      procps imagemagick \
      curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# A tiny window manager so the SDL window gets input focus (keyboard) and is
# maximized to fill the screen. xdotool is for scripted demos/tests.
RUN apt-get update && apt-get install -y --no-install-recommends \
      matchbox-window-manager xdotool \
    && rm -rf /var/lib/apt/lists/*

# Game files (the closed-source binary + data + bundled .so libs).
# Downloaded from Bay12 Games at build time.
ARG DF_VERSION=53_14
ARG DF_URL=https://www.bay12games.com/dwarves/df_${DF_VERSION}_linux.tar.bz2
RUN mkdir -p /opt/df \
    && curl -fsSL "$DF_URL" -o /tmp/df.tar.bz2 \
    && tar -xjf /tmp/df.tar.bz2 -C /opt/df --strip-components=1 \
    && rm /tmp/df.tar.bz2
LABEL df.version="${DF_VERSION}"

# Override the bundled/system SDL2 with our XInput2-free build (see stage 1).
# DF loads this first via LD_LIBRARY_PATH=/opt/df; ABI-compatible with the
# apt libSDL2_image it links against.
COPY --from=sdlbuild /sdl/libSDL2-2.0.so.0 /opt/df/libSDL2-2.0.so.0

# Runtime config. The engine reads overrides from prefs/init.txt, but we also
# patch the shipped defaults so the settings apply no matter which file wins.
#   PRINT_MODE:2D  -> software-capable SDL2 renderer (no real GPU needed)
#   SOUND:NO       -> don't init fmod/audio (saves CPU; no audio device anyway)
#   WINDOWED:YES   -> fixed window, maximized by the WM to fill the screen
RUN mkdir -p /opt/df/prefs && \
    sed -i \
      -e 's/\[PRINT_MODE:[^]]*\]/[PRINT_MODE:2D]/' \
      -e 's/\[SOUND:[^]]*\]/[SOUND:NO]/' \
      -e 's/\[WINDOWED:[^]]*\]/[WINDOWED:YES]/' \
      /opt/df/data/init/init_default.txt && \
    printf '[PRINT_MODE:2D]\n[SOUND:NO]\n[WINDOWED:YES]\n[FPS_CAP:30]\n[G_FPS_CAP:20]\n' \
      > /opt/df/prefs/init.txt

COPY docker/start.sh /usr/local/bin/start.sh
RUN chmod +x /usr/local/bin/start.sh

EXPOSE 5900 6080
ENV DISPLAY=:99 \
    SDL_VIDEODRIVER=x11 \
    SDL_AUDIODRIVER=dummy \
    SDL_RENDER_DRIVER=software \
    LD_LIBRARY_PATH=/opt/df
ENTRYPOINT ["/usr/local/bin/start.sh"]
