# Build context is the monorepo root (set via dockerContextDir in .actor/actor.json),
# so the build can use the pnpm workspace lockfile for a deterministic install.
FROM apify/actor-node:22 AS builder

WORKDIR /app

RUN corepack enable

# Whole workspace (root .dockerignore keeps node_modules/.git/dist out of the context).
COPY . ./

# Deterministic install (frozen lockfile, honors minimumReleaseAge) of the actor + its workspace deps.
RUN pnpm install --frozen-lockfile --filter actor-cheerio-scraper...

# Build the actor and its workspace dependency @apify/scraper-tools.
RUN pnpm --filter actor-cheerio-scraper... build

# Self-contained production bundle. inject-workspace-packages copies the built
# @apify/scraper-tools (a runtime workspace dep) into node_modules instead of symlinking it.
RUN pnpm config set inject-workspace-packages true \
    && pnpm --filter actor-cheerio-scraper deploy --prod /deploy

FROM apify/actor-node:22

WORKDIR /usr/src/app

# Replace the base image's template with only the lean production bundle.
RUN find /usr/src/app -mindepth 1 -delete
COPY --from=builder /deploy ./

ENV APIFY_DISABLE_OUTDATED_WARNING=1

CMD ["node", "dist/main.js"]
