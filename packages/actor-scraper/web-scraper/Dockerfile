# Build context is the monorepo root (dockerContextDir in .actor/actor.json), so the build uses the
# root pnpm-lock.yaml for a deterministic install.
#
# The base is pinned by digest (reproducible Chrome + OS deps). The actor pins puppeteer to the version
# this base ships (24-25.4.0 -> puppeteer 25.4.0) and bundles it, so the bundled driver matches the
# Chrome binary it drives. Renovate bumps the base digest and the puppeteer pin together.
FROM apify/actor-node-puppeteer-chrome:26-25.4.0@sha256:861a9e6827e275b378ee5010862508c9ed425a44758a72efef6c7eb844c479eb AS builder

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
RUN pnpm install --frozen-lockfile --filter actor-web-scraper...

# Build the actor and its workspace dependency @apify/scraper-tools.
RUN pnpm --filter actor-web-scraper... build

# Self-contained production bundle; inject-workspace-packages copies the built @apify/scraper-tools
# into node_modules instead of symlinking it.
RUN pnpm --config.inject-workspace-packages=true --filter actor-web-scraper deploy --prod /deploy

FROM apify/actor-node-puppeteer-chrome:26-25.4.0@sha256:861a9e6827e275b378ee5010862508c9ed425a44758a72efef6c7eb844c479eb

# Base WORKDIR is /home/myuser and ships Chrome plus the Xvfb entrypoint. Replace only the template
# node_modules with the lean production bundle (which carries the matching puppeteer); Chrome itself
# stays in the base image.
RUN rm -rf node_modules
COPY --from=builder --chown=myuser /deploy ./

# The base announces its Chrome via APIFY_CHROME_EXECUTABLE_PATH, but the apify 3.x / crawlee 3.x
# launcher reads only PUPPETEER_EXECUTABLE_PATH — mirror the base's own value so we follow whatever
# Chrome the base ships.
ENV PUPPETEER_EXECUTABLE_PATH=${APIFY_CHROME_EXECUTABLE_PATH} \
    APIFY_DISABLE_OUTDATED_WARNING=1

CMD ["node", "dist/main.js"]
