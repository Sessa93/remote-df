# Control-panel sidecar image. Multi-stage: install + build, then a slim runtime
# using Next.js standalone output.
FROM node:20-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
# Use a lockfile-aware install when present, else a plain install.
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=7070
# Standalone server + static assets + public.
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
EXPOSE 7070
CMD ["node", "server.js"]
