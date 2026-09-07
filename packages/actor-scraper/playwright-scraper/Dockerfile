# Build context is the monorepo root (dockerContextDir in .actor/actor.json), so the build uses the
# root pnpm-lock.yaml for a deterministic install.
#
# The base is pinned by digest (reproducible Chromium + OS deps). The actor pins playwright to the
# version this base ships (24-1.61.1 -> playwright 1.61.1) and bundles it, so the bundled driver
# matches the Chromium binary it drives. Renovate bumps the base digest and the playwright pin together.
#
# HELD at 1.61.1 on purpose. playwright 1.62.0 stopped disabling Chromium's RenderDocument
# (microsoft/playwright#41303, Chromium 149 -> 151), which makes page.close() hang on pages that
# commit a second navigation: measured 11/30 on a single client-side redirect, 0/30 with the feature
# disabled. Crawlee then leaks the page and its BrowserController never recovers (apify/crawlee#1829).
# Do not move past 1.61.1 until microsoft/playwright#42068 ships (milestone v1.64) or crawlee's
# browser pool survives a close that never settles.
FROM apify/actor-node-playwright:24-1.61.1@sha256:ec39f7a735c35c3f78e450bf6833c1adcc0b6d0e132c0e4fd9010317a9d7a212 AS builder

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

FROM apify/actor-node-playwright:24-1.61.1@sha256:ec39f7a735c35c3f78e450bf6833c1adcc0b6d0e132c0e4fd9010317a9d7a212

# Base WORKDIR is /home/myuser and ships the browser plus the Xvfb entrypoint. Replace only the
# template node_modules with the lean production bundle (which carries the matching playwright); the
# browser binary itself stays in the base image.
RUN rm -rf node_modules
COPY --from=builder --chown=myuser /deploy ./

ENV APIFY_DISABLE_OUTDATED_WARNING=1

CMD ["node", "dist/main.js"]
