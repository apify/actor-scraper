# Build context is the monorepo root (dockerContextDir in .actor/actor.json), so the build uses the
# root pnpm-lock.yaml for a deterministic install.
#
# The base is pinned by digest (reproducible Camoufox binary + OS deps). The actor pins playwright and
# camoufox-js to the versions this base ships (24-1.59.1 -> playwright 1.59.1, camoufox-js 0.11.1) and
# bundles them, so the bundled drivers match the Camoufox binary they drive. The binary itself lives in
# ~/.cache/camoufox (outside node_modules) and stays in the base. Tag 24-1.59.1 is the newest Camoufox
# base that survives page JS errors (24-1.60.0 crashes the process on them).
FROM apify/actor-node-playwright-camoufox:24-1.59.1@sha256:eadc96fa9492284eb45ef70b6b91c841fae7f142d25a22ae2887a21bb78b3469 AS builder

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

FROM apify/actor-node-playwright-camoufox:24-1.59.1@sha256:eadc96fa9492284eb45ef70b6b91c841fae7f142d25a22ae2887a21bb78b3469

# Base WORKDIR is /home/myuser and ships the Xvfb entrypoint plus the Camoufox binary in
# ~/.cache/camoufox (outside node_modules). Replace only the template node_modules with the lean
# production bundle (which carries the matching playwright + camoufox-js); the binary stays in the base.
RUN rm -rf node_modules
COPY --from=builder --chown=myuser /deploy ./

ENV APIFY_DISABLE_OUTDATED_WARNING=1

CMD ["node", "dist/main.js"]
