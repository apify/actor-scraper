# Build context is the monorepo root (dockerContextDir in .actor/actor.json), so the build uses the
# root pnpm-lock.yaml for a deterministic install.
#
# Browser determinism comes from pinning the base image by DIGEST below: the Chromium binary AND the
# matching Playwright driver both live in the base and are frozen together by the digest. The actor
# does NOT ship its own Playwright — it's dropped from the deploy bundle and resolved from the base at
# runtime, so driver and binary can never drift.
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

# Build the actor and its workspace dependency @apify/scraper-tools (playwright is needed here for
# type-checking only; the runtime copy comes from the base — see below).
RUN pnpm --filter actor-playwright-scraper... build

# Self-contained production bundle; inject-workspace-packages copies the built @apify/scraper-tools
# into node_modules instead of symlinking it.
RUN pnpm --config.inject-workspace-packages=true --filter actor-playwright-scraper deploy --prod /deploy

# Drop the bundle's Playwright so the runtime resolves it from the base image, where it matches the
# Chromium binary. This is what keeps driver and binary in lockstep.
RUN rm -rf \
    /deploy/node_modules/playwright \
    /deploy/node_modules/playwright-core \
    /deploy/node_modules/.bin/playwright \
    /deploy/node_modules/.bin/playwright-core

FROM apify/actor-node-playwright:24-1.61.0@sha256:5c0155bb5a0a90572ef021c2b4e2e195c50971e0c1ae00f081ffa47e62036c60

# Base WORKDIR is /home/myuser and ships the browser stack in node_modules plus the Xvfb entrypoint.
# Place the app in a child directory so the driver dropped above resolves up to the base's copy.
COPY --from=builder --chown=myuser /deploy ./app
WORKDIR /home/myuser/app

ENV APIFY_DISABLE_OUTDATED_WARNING=1

CMD ["node", "dist/main.js"]
