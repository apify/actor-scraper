# AGENTS.md - Coding Agent Guidelines

Guidelines for AI coding agents working on `actor-scraper`, Apify's monorepo of generic scraper Actors.

## Start here: pick the right playbook

Read this file first for context, then the principles that apply to your task. They state constraints and the reasoning behind them, not steps to follow — work the steps out yourself.

| Your task                                  | Read                                                                         |
| ------------------------------------------ | ---------------------------------------------------------------------------- |
| Fixing a bug, regression, or failing test  | [docs/agents/fixing-bugs.md](docs/agents/fixing-bugs.md)                     |
| Implementing a feature or new input option | [docs/agents/implementing-features.md](docs/agents/implementing-features.md) |

Both playbooks share one rule that overrides convenience: **Crawlee is ours — we maintain it, so investigate it, fix it there by preference, and never route around it.** Details in each playbook.

## What this repo is

A monorepo of the **generic scrapers**: Apify's configure-don't-code Actors, where the user supplies a start URL, some crawl settings, and a `pageFunction` — a JavaScript function as a string — and the Actor runs it against every page.

| Package                                     | Published as                 | Engine                                                 |
| ------------------------------------------- | ---------------------------- | ------------------------------------------------------ |
| `packages/actor-scraper/web-scraper`        | `apify/web-scraper`          | Puppeteer, `pageFunction` runs **in the browser page** |
| `packages/actor-scraper/puppeteer-scraper`  | `apify/puppeteer-scraper`    | Puppeteer, `pageFunction` runs in Node                 |
| `packages/actor-scraper/playwright-scraper` | `apify/playwright-scraper`   | Playwright                                             |
| `packages/actor-scraper/cheerio-scraper`    | `apify/cheerio-scraper`      | Raw HTTP + Cheerio                                     |
| `packages/actor-scraper/jsdom-scraper`      | `apify/jsdom-scraper`        | Raw HTTP + jsdom                                       |
| `packages/actor-scraper/camoufox-scraper`   | `apify/camoufox-scraper`     | Camoufox (anti-detection Firefox)                      |
| `packages/actor-scraper/sitemap-scraper`    | `apify/sitemap-extractor`    | HTTP HEAD over sitemaps                                |
| `packages/scraper-tools`                    | `@apify/scraper-tools` (npm) | Shared runtime for all of the above                    |

Three consequences worth internalizing before you change anything:

- **`pageFunction` and its context object are a public API.** Thousands of user-written scripts run against them. Every property on the context (`$`, `page`, `request`, `log`, `globalStore`, `skipLinks`, `enqueueRequest`, `saveSnapshot`, …) is something someone's script already calls. Removing, renaming, or retyping one breaks live scrapers silently.
- **`INPUT_SCHEMA.json` is a public API too**, for the same reason, plus saved tasks on the platform reference option names directly.
- **These Actors are old, heavily used, and full of deliberate backward compatibility.** `Apify` aliased to `Actor` on the context, `RequestQueueV2`, string-eval'd hooks — those are not oversights. Do not "modernize" them as a side effect of another change.

## Crawlee

The scrapers are thin wrappers around [Crawlee](https://crawlee.dev/), which **Apify maintains — we own it**. This is not a third-party black box; treat it as an upstream part of this codebase. When a change could be made either here or in Crawlee, Crawlee is the preferred home for it.

- **Establish what Crawlee already does before writing crawling, queueing, session, proxy, retry, or fingerprinting code.**
- **Check <https://github.com/apify/crawlee/issues> before building anything Crawlee-shaped**, including closed issues and merged PRs. It may already exist in a newer build, be implemented and unreleased, or have an agreed design worth following instead of inventing your own. Note which major it landed in.
- **Extend rather than reimplement**, reaching for the cheapest mechanism that works: configuration, then hooks (how the existing Actors add nearly everything, including the user's own string-supplied hooks), then subclassing, then an upstream change.
- **If Crawlee can't express what you need, that's an upstream change, not a local workaround.**
- **Betas are normal, not a risk.** Build on the beta that has what you need. Never bump a Crawlee **major** — crossing the v3/v4 line is a migration project with its own decision, never a step inside a feature.
- **Never** fork or vendor Crawlee into `src/`, monkey-patch it, reimplement a queue or session pool or retry policy it already provides, or reach into private and `@internal` fields to get at something unexported. Export it upstream instead.

# Implementing features

Read [AGENTS.md](../../AGENTS.md) first for repo and platform context. These are the principles for new features, new input options, and behavior changes — not a procedure. Work out the steps yourself; these are the constraints the result has to satisfy.

## The public surface is additive-only

**`INPUT_SCHEMA.json`** is a public API — saved tasks and integrations reference option names directly. Add; never rename, retype, or repurpose. Default to existing behavior so current tasks are unaffected. It's loaded and validated at runtime, so a mismatch between schema and code is a runtime failure, not a compile error. `title` and `description` render in the input form, so they're user-facing copy. When the same capability lands in more than one Actor it must have the same name and semantics in both — users move between these Actors.

**The `pageFunction` context** in [packages/scraper-tools/src/context.ts](../../packages/scraper-tools/src/context.ts) is the most sensitive surface in the repo: it's the entire API user scripts get. Additive only — never remove, rename, or retype an existing property, because something out there calls it. Things users shouldn't touch are hidden behind Symbols on purpose, not merely undocumented. A new property should exist on every engine's context, or be clearly engine-specific in the way `$` and `page` already are; silently present-on-some is the worst outcome for users. For `web-scraper` it also has to exist on the browser side in [bundle.browser.ts](../../packages/actor-scraper/web-scraper/src/internals/bundle.browser.ts), and anything non-serializable needs a bridge — plan for that before designing the API, not after.

Report what you changed, which Actors and packages it affects, what you verified, and anything you deliberately left out. Don't commit or push.

## Fixing bugs

Read [AGENTS.md](../../AGENTS.md) first for repo and platform context. These are the principles for bug fixes, regressions, and failing tests — not a procedure. Work out the steps yourself; these are the constraints the result has to satisfy.

## Smallest diff wins

A bug fix is not an opportunity to improve the code around it. No refactoring, renaming, reorganizing, extracting helpers, reformatting untouched code, or "while I'm here" cleanups.

## Know your blast radius before you edit

A fix in an Actor's own `crawler_setup.ts` affects one Actor. A fix in `packages/scraper-tools` ships to all seven and to `@apify/scraper-tools` on npm, so it needs correspondingly higher confidence and a check that the other Actors don't depend on the current behavior. Say which one you're doing when you report.

Report what the root cause was, what you changed, which Actors are affected, and what you verified. If something still fails, say so with the output. Don't commit or push.

## Repository layout

- `packages/actor-scraper/*` — one directory per Actor. Each holds `src/main.ts` (a one-liner calling `runActor`), `src/internals/crawler_setup.ts` (all the wiring), `src/internals/consts.ts` (`Input` type and enums), `INPUT_SCHEMA.json`, `Dockerfile`, `README.md`.
- `packages/scraper-tools/src` — the shared runtime:
    - [run_actor.ts](packages/scraper-tools/src/run_actor.ts) — the `Actor.main()` wrapper every Actor's entry point calls
    - [context.ts](packages/scraper-tools/src/context.ts) — the `Context` class exposed to `pageFunction`; private members are hidden behind Symbols on purpose
    - [tools.ts](packages/scraper-tools/src/tools.ts) — `evalFunctionOrThrow` / `evalFunctionArrayOrThrow` (user code compiled via `node:vm`), input validation, request metadata
    - [browser_tools.ts](packages/scraper-tools/src/browser_tools.ts) — snapshots and browser-side plumbing
    - [consts.ts](packages/scraper-tools/src/consts.ts) — shared constants such as `META_KEY`
- `test/scraper-tools/` — unit tests (vitest)
- `test/e2e/` — end-to-end tests; each `test/e2e/scrapers/<case>/test.mjs` runs a real Actor against real pages
- `scripts/` — build copy step and the platform build trigger
- `docs/agents/` — these playbooks

`web-scraper` is the odd one out: [src/internals/bundle.browser.ts](packages/actor-scraper/web-scraper/src/internals/bundle.browser.ts) is compiled and injected into the page, so its `pageFunction` and context live in the browser, with a bridge back to Node. Changes there need to be made on both sides.

## Commands

Package manager is **pnpm** (version pinned in `packageManager`). Builds go through turbo; do not use npm or yarn.

```bash
pnpm build                # turbo run build across all packages
pnpm test                 # vitest unit tests
pnpm test:e2e             # end-to-end scraper tests (real runs, slow)
pnpm tsc-check-tests      # type-check the test project
pnpm lint                 # oxlint --type-aware
pnpm lint:fix             # oxlint --type-aware --fix
pnpm format               # oxfmt
pnpm format:check         # oxfmt --check
pnpm clean                # turbo run clean
```

To run a single Actor locally, from its package directory:

```bash
pnpm start
```

Notes:

- Linting is **oxlint**, formatting is **oxfmt** — not ESLint or Prettier. Husky plus lint-staged runs both on commit.
- Commit messages must follow conventional commits (commitlint enforces it); release notes are generated from them.
- Vitest aliases `@apify/scraper-tools` to `packages/scraper-tools/src`, so unit tests see your source changes without a build. E2E tests do not — build first.

### Testing

```bash
pnpm exec vitest run test/scraper-tools/tools.test.ts    # single unit test file
pnpm exec vitest run -t "test name"                      # filter by name
node test/e2e/runScraperTests.mjs                        # all e2e tests
```

### Errors and logging

- Use `log` from `@apify/log` (already re-exported onto the `pageFunction` context).
- Errors thrown out of a `pageFunction` are surfaced per-request by Crawlee's retry machinery — do not swallow them in the wrapper.
- Reserve fatal errors for genuinely unrecoverable setup problems, such as invalid input.

## Working agreements

- **Do not commit or push unless explicitly asked.** Leave changes in the working tree and report what you changed.
- This is a **public, Apache-2.0 repository** with external contributors — see [CONTRIBUTING.md](CONTRIBUTING.md). Code and comments are read by people outside Apify.
- Actor `README.md` files are the store pages users read; they are user-facing copy, not internal notes. `docs/*.md` is owned by a documentation code owner ([.github/CODEOWNERS](.github/CODEOWNERS)).
- A change that touches `packages/scraper-tools` touches **every** Actor. Say so explicitly when reporting it.
