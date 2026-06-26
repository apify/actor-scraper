# Build context is the monorepo root (dockerContextDir in .actor/actor.json), so the build uses the
# root pnpm-lock.yaml for a deterministic install.
#
# The base is pinned by digest (reproducible Chromium + OS deps). The actor pins playwright to the
# version this base ships (24-1.61.0 -> playwright 1.61.0) and bundles it, so the bundled driver
# matches the Chromium binary it drives. Renovate bumps the base digest and the playwright pin together.
FROM apify/actor-node-playwright:24-1.61.0@sha256:5c0155bb5a0a90572ef021c2b4e2e195c50971e0c1ae00f081ffa47e62036c60 AS builder

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
RUN pnpm install --frozen-lockfile --filter actor-playwright-scraper...

# Build the actor and its workspace dependency @apify/scraper-tools.
RUN pnpm --filter actor-playwright-scraper... build

# Self-contained production bundle; inject-workspace-packages copies the built @apify/scraper-tools
# into node_modules instead of symlinking it.
RUN pnpm --config.inject-workspace-packages=true --filter actor-playwright-scraper deploy --prod /deploy

FROM apify/actor-node-playwright:24-1.61.0@sha256:5c0155bb5a0a90572ef021c2b4e2e195c50971e0c1ae00f081ffa47e62036c60

# Base WORKDIR is /home/myuser and ships the browser plus the Xvfb entrypoint. Replace only the
# template node_modules with the lean production bundle (which carries the matching playwright); the
# browser binary itself stays in the base image.
RUN rm -rf node_modules
COPY --from=builder --chown=myuser /deploy ./

ENV APIFY_DISABLE_OUTDATED_WARNING=1

CMD ["node", "dist/main.js"]
