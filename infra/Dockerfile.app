FROM golang:1.25.11-trixie@sha256:56a4d6ead4365cd569ca388003bdce672e7ca7286513f96b44b03d3b5e79d26f AS esbuild-build

ARG ESBUILD_COMMIT=208f539945b145e7c9d6d844290f81c3fe5af320

WORKDIR /src

RUN git clone https://github.com/evanw/esbuild.git . \
    && git checkout "${ESBUILD_COMMIT}" \
    && CGO_ENABLED=0 go build -trimpath -ldflags='-s -w' -o /out/esbuild ./cmd/esbuild

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
RUN --mount=type=cache,id=raho-pnpm-store,target=/pnpm/store \
    CI=true pnpm install --offline --frozen-lockfile --prod
COPY --from=esbuild-build /out/esbuild /tmp/esbuild-patched
RUN test "$(find node_modules/.pnpm -type f \( -path '*/node_modules/esbuild/bin/esbuild' -o -path '*/node_modules/@esbuild/*/bin/esbuild' \) | wc -l)" -ge 2 \
    && find node_modules/.pnpm -type f \( -path '*/node_modules/esbuild/bin/esbuild' -o -path '*/node_modules/@esbuild/*/bin/esbuild' \) -exec cp /tmp/esbuild-patched {} \; \
    && rm /tmp/esbuild-patched

FROM node:24.18.0-bookworm-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d AS runtime

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && install -d -o node -g node /var/lib/raho/whatsapp-auth /nodejs/bin \
    && ln -s /usr/local/bin/node /nodejs/bin/node \
    && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx \
    && rm -rf /var/lib/apt/lists/*
COPY --from=build --chown=node:node /app /app

USER node

ENTRYPOINT ["/usr/local/bin/node"]
