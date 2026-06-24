# Build context is the monorepo root (dockerContextDir in .actor/actor.json), so the build uses the
# root pnpm-lock.yaml for a deterministic install.
#
# Browser determinism comes from pinning the base image by DIGEST below: the Chrome binary AND the
# matching Puppeteer driver both live in the base and are frozen together by the digest. The actor
# does NOT ship its own Puppeteer — it's dropped from the deploy bundle and resolved from the base at
# runtime, so driver and binary can never drift.
FROM apify/actor-node-puppeteer-chrome:24-25.2.0@sha256:e9f588cd827e542bdc7b476be7dd3ba87b8ca3b4136e2e081e5fa0e3c940d50d AS builder

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
RUN pnpm install --frozen-lockfile --filter actor-puppeteer-scraper...

# Build the actor and its workspace dependency @apify/scraper-tools (puppeteer is needed here for
# type-checking only; the runtime copy comes from the base — see below).
RUN pnpm --filter actor-puppeteer-scraper... build

# Self-contained production bundle; inject-workspace-packages copies the built @apify/scraper-tools
# into node_modules instead of symlinking it.
RUN pnpm --config.inject-workspace-packages=true --filter actor-puppeteer-scraper deploy --prod /deploy

# Drop the bundle's Puppeteer so the runtime resolves it from the base image, where it matches the
# Chrome binary. This is what keeps driver and binary in lockstep.
RUN rm -rf \
    /deploy/node_modules/puppeteer \
    /deploy/node_modules/puppeteer-core \
    /deploy/node_modules/.bin/puppeteer

FROM apify/actor-node-puppeteer-chrome:24-25.2.0@sha256:e9f588cd827e542bdc7b476be7dd3ba87b8ca3b4136e2e081e5fa0e3c940d50d

# Base WORKDIR is /home/myuser and ships Chrome plus the Xvfb entrypoint. Place the app in a child
# directory so the driver dropped above resolves up to the base's copy.
COPY --from=builder --chown=myuser /deploy ./app
WORKDIR /home/myuser/app

# The base announces its Chrome via APIFY_CHROME_EXECUTABLE_PATH, but apify@3.7/crawlee@3.16 read only
# PUPPETEER_EXECUTABLE_PATH — mirror the base's own value so we follow whatever Chrome the base ships.
ENV PUPPETEER_EXECUTABLE_PATH=${APIFY_CHROME_EXECUTABLE_PATH} \
    APIFY_DISABLE_OUTDATED_WARNING=1

CMD ["node", "dist/main.js"]
