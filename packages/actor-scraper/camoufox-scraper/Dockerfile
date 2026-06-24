# Build context is the monorepo root (dockerContextDir in .actor/actor.json), so the build uses the
# root pnpm-lock.yaml for a deterministic install.
#
# Browser determinism comes from pinning the base image by DIGEST below: the Camoufox binary AND the
# playwright/camoufox-js drivers that match it both live in the base and are frozen together by the
# digest. The actor does NOT ship its own browser drivers — they're dropped from the deploy bundle
# and resolved from the base at runtime, so driver and binary can never drift. Tag 24-1.59.1 is the
# newest Camoufox base that survives page JS errors (24-1.60.0 crashes the process on them).
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

# Build the actor and its workspace dependency @apify/scraper-tools (playwright/camoufox-js are needed
# here for type-checking only; the runtime copies come from the base — see below).
RUN pnpm --filter actor-camoufox-scraper... build

# Self-contained production bundle; inject-workspace-packages copies the built @apify/scraper-tools
# into node_modules instead of symlinking it.
RUN pnpm --config.inject-workspace-packages=true --filter actor-camoufox-scraper deploy --prod /deploy

# Drop the bundle's browser drivers so the runtime resolves them from the base image, where they are
# guaranteed to match the Camoufox binary. This is what keeps driver and binary in lockstep.
RUN rm -rf \
    /deploy/node_modules/playwright \
    /deploy/node_modules/playwright-core \
    /deploy/node_modules/camoufox-js \
    /deploy/node_modules/better-sqlite3 \
    /deploy/node_modules/.bin/playwright \
    /deploy/node_modules/.bin/playwright-core \
    /deploy/node_modules/.bin/camoufox-js

FROM apify/actor-node-playwright-camoufox:24-1.59.1@sha256:eadc96fa9492284eb45ef70b6b91c841fae7f142d25a22ae2887a21bb78b3469

# Base WORKDIR is /home/myuser and ships the browser stack in node_modules plus the Xvfb entrypoint.
# Place the app in a child directory so the drivers dropped above resolve up to the base's copies.
COPY --from=builder --chown=myuser /deploy ./app
WORKDIR /home/myuser/app

ENV APIFY_DISABLE_OUTDATED_WARNING=1

CMD ["node", "dist/main.js"]
