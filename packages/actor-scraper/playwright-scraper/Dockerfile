# Build context is the monorepo root (set via dockerContextDir in .actor/actor.json),
# so the build can use the pnpm workspace lockfile for a deterministic install.
FROM apify/actor-node-playwright:22 AS builder

# The browser base runs as `myuser`; the build stage needs root for corepack + a writable workdir.
USER root
WORKDIR /app

RUN corepack enable

# Browsers ship with the base image; never let an npm postinstall download them.
# puppeteer is pulled transitively via @crawlee/browser-pool even for non-puppeteer actors.
ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

# Whole workspace (root .dockerignore keeps node_modules/.git/dist out of the context).
COPY . ./

# Deterministic install (frozen lockfile, honors minimumReleaseAge) of the actor + its workspace deps.
RUN pnpm install --frozen-lockfile --filter actor-playwright-scraper...

# Build the actor and its workspace dependency @apify/scraper-tools.
RUN pnpm --filter actor-playwright-scraper... build

# Self-contained production bundle; inject-workspace-packages copies the built
# @apify/scraper-tools (a runtime workspace dep) into node_modules instead of symlinking it.
RUN pnpm config set inject-workspace-packages true \
    && pnpm --filter actor-playwright-scraper deploy --prod /deploy

FROM apify/actor-node-playwright:22

# Base WORKDIR is /home/myuser and ships a template node_modules plus the Xvfb entrypoint.
# Drop the template's node_modules and overlay only the lean production bundle; the inherited
# ENTRYPOINT (xvfb-entrypoint.sh) still wraps CMD with Xvfb, and the bundled browser is reused.
RUN rm -rf node_modules
COPY --from=builder --chown=myuser /deploy ./

ENV APIFY_DISABLE_OUTDATED_WARNING=1

CMD ["node", "dist/main.js"]
