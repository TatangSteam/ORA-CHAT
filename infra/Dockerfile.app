FROM node:24.18.0-bookworm-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d AS build

ENV NEXT_TELEMETRY_DISABLED=1 \
    PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@11.20.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.base.json ./

RUN --mount=type=cache,id=raho-pnpm-store,target=/pnpm/store \
    pnpm fetch --frozen-lockfile

COPY apps ./apps
COPY packages ./packages

RUN --mount=type=cache,id=raho-pnpm-store,target=/pnpm/store \
    pnpm install --offline --frozen-lockfile
RUN pnpm build

FROM node:24.18.0-bookworm-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d AS runtime

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && install -d -o node -g node /var/lib/raho/whatsapp-auth \
    && rm -rf /var/lib/apt/lists/*
COPY --from=build --chown=node:node /app /app

USER node
