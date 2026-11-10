# Build context is the monorepo root (dockerContextDir in .actor/actor.json), so the build uses the
# root pnpm-lock.yaml for a deterministic install.
#
# The base is pinned by digest (reproducible Camoufox binary + OS deps). The actor pins playwright and
# camoufox-js to the versions this base ships (26-1.62.1 -> playwright 1.62.1, camoufox-js 0.13.0) and
# bundles them, so the bundled driver matches the Camoufox binary it drives, which is why this actor's
# playwright differs from the version the rest of the workspace uses. The binary itself lives in
# ~/.cache/camoufox (outside node_modules) and stays in the base. Move the tag and the pins together,
# and check a new tag by launching Camoufox in it on a page that throws: the 1.60.0 base crashed the
# process on page JS errors. playwright-scraper's 1.61.1 hold (Chromium RenderDocument) does not apply
# to Camoufox, which is Firefox.
FROM apify/actor-node-playwright-camoufox:26-1.62.1@sha256:63c25bfff97ef8aa0cc0b3791d09b1b3edefe2226972070fc39dc33e8a9af29c AS builder

# The browser base runs as `myuser`; the build stage needs root for corepack + a writable workdir.
USER root
WORKDIR /app

RUN corepack enable

# Whole workspace (root .dockerignore keeps node_modules/.git/dist out of the context).
COPY . ./

# Deterministic install (frozen lockfile, honors minimumReleaseAge) of the actor + its workspace deps.
RUN pnpm install --frozen-lockfile --filter actor-camoufox-scraper...

# Build the actor and its workspace dependency @apify/scraper-tools.
RUN pnpm --filter actor-camoufox-scraper... build

# Self-contained production bundle; inject-workspace-packages copies the built @apify/scraper-tools
# into node_modules instead of symlinking it.
RUN pnpm --config.inject-workspace-packages=true --filter actor-camoufox-scraper deploy --prod /deploy

FROM apify/actor-node-playwright-camoufox:26-1.62.1@sha256:63c25bfff97ef8aa0cc0b3791d09b1b3edefe2226972070fc39dc33e8a9af29c

# Base WORKDIR is /home/myuser and ships the Xvfb entrypoint plus the Camoufox binary in
# ~/.cache/camoufox (outside node_modules). Replace only the template node_modules with the lean
# production bundle (which carries the matching playwright + camoufox-js); the binary stays in the base.
RUN rm -rf node_modules
COPY --from=builder --chown=myuser /deploy ./

ENV APIFY_DISABLE_OUTDATED_WARNING=1

CMD ["node", "dist/main.js"]
