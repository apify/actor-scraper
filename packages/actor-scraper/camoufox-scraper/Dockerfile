# Build context is the monorepo root (dockerContextDir in .actor/actor.json), so the build uses the
# root pnpm-lock.yaml for a deterministic install.
#
# The base is pinned by digest (reproducible Camoufox binary + OS deps). The actor pins playwright to
# the version this base ships (24-1.59.1 -> playwright 1.59.1) and bundles it, so the bundled driver
# matches the Camoufox binary it drives, which is why this actor deliberately trails the playwright
# version the rest of the workspace uses. The binary itself lives in ~/.cache/camoufox (outside
# node_modules) and stays in the base. Tag 1.59.1 is the newest Camoufox base that survives page JS
# errors (1.60.0 crashes the process on them).
#
# camoufox-js stays on 0.11.2: 0.12.0 requires better-sqlite3 ^13, which dropped prebuilt binaries and
# so needs a C++ toolchain that the Apify base images do not carry.
FROM apify/actor-node-playwright-camoufox:24-1.59.1@sha256:02cf108662749342538908f9409ffc270b741af1253e96d0c563b12de36f3b88 AS builder

# The browser base runs as `myuser`; the build stage needs root for corepack + a writable workdir.
USER root
WORKDIR /app

RUN corepack enable

# Browsers ship with the base image; never let an npm postinstall download them.
ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

# Whole workspace (root .dockerignore keeps node_modules/.git/dist out of the context).
COPY . ./

# Deterministic install (frozen lockfile, honors minimumReleaseAge) of the actor + its workspace deps.
RUN pnpm install --frozen-lockfile --filter actor-camoufox-scraper...

# Build the actor and its workspace dependency @apify/scraper-tools.
RUN pnpm --filter actor-camoufox-scraper... build

# Self-contained production bundle; inject-workspace-packages copies the built @apify/scraper-tools
# into node_modules instead of symlinking it. The native better-sqlite3 binding (a camoufox-js dep) is
# compiled here against the base's Node 24, and the runtime stage uses that same base, so it matches.
RUN pnpm --config.inject-workspace-packages=true --filter actor-camoufox-scraper deploy --prod /deploy

FROM apify/actor-node-playwright-camoufox:24-1.59.1@sha256:02cf108662749342538908f9409ffc270b741af1253e96d0c563b12de36f3b88

# Base WORKDIR is /home/myuser and ships the Xvfb entrypoint plus the Camoufox binary in
# ~/.cache/camoufox (outside node_modules). Replace only the template node_modules with the lean
# production bundle (which carries the matching playwright + camoufox-js); the binary stays in the base.
RUN rm -rf node_modules
COPY --from=builder --chown=myuser /deploy ./

ENV APIFY_DISABLE_OUTDATED_WARNING=1

CMD ["node", "dist/main.js"]
