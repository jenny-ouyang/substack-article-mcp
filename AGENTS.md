# Project: substack-article-mcp

## What this is
A local MCP (Model Context Protocol) server for Substack. It lets an MCP client
(Cursor, Claude Desktop, Claude Code) read Substack articles, comments, feeds, and
subscriptions. Public content works with no auth (given a `subdomain`); logging in
with a Substack cookie unlocks paid/premium article bodies plus personalized tools
(`list_subscriptions`, `get_feed`, `get_inbox`).

Distributed three ways: an npm package (`npx -y substack-article-mcp install ...`
for Cursor / Claude Code), and a `.mcpb` bundle for Claude Desktop (double-click
install, cookie pasted in Extension settings). Runs entirely on the user's machine
as a stdio subprocess of the AI client. Uses Substack's internal APIs; not
affiliated with Substack. MIT.

Stack: TypeScript (ESM) + `@modelcontextprotocol/sdk` ^1.26 + `cheerio` (HTML→MD) +
`puppeteer-core` (Chrome login flow) + `zod`. Source in `src/`, compiled to `dist/`
via `tsc`.

## Status (updated: 2026-07-06)
**Staleness verdict: DORMANT since 2026-03-15 → treat as OUTDATED / KNOWN-BROKEN.**

Evidence: last commit `2a5ad47` on 2026-03-15 ("chore: bump manifest to 0.8.2,
rebuild .mcpb"). **Zero commits in the last 90 days** (all 19 commits fall
2026-02-18 → 2026-03-15). No active development.

**Known-broken — do NOT recommend this as a working MCP without re-verifying** (per
Jenny's notes, as of the 2026-03-15 state):
1. **Does not load/install cleanly.** Treat a fresh `npx` / `.mcpb` install as
   unproven until re-tested.
2. **The published npm package description is wrong/misleading.** The `package.json`
   description here reads correctly, but what is (or was) live on npm did not match —
   verify against the actual npm registry listing before trusting it.
3. **Claude Desktop `.mcpb` auth does not work.** Cookie passed via Extension
   settings did not reach the server in practice. See "Auth mechanism" below for what
   the bundle actually does vs. the earlier env-var-to-subprocess suspicion.

These are date-stamped claims from Jenny's memory + the repo's frozen 2026-03-15
state, NOT a fresh test result. Re-verification steps are in Open questions.

**Version state is inconsistent across the repo (documented, not fixed):**
- `package.json` (committed) = `0.8.2`; working tree bumps it to `0.8.3` (uncommitted).
- `manifest.json` (the `.mcpb` bundle descriptor) = `0.8.2`.
- `substack-article-mcp.mcpb` was built 2026-03-15; it is the 0.8.2 bundle. (Jenny's
  memory referenced a "v0.7.1 .mcpb" — the repo on disk is newer, at 0.8.2. Trust
  the repo, and re-verify what is actually published.)

**Uncommitted in-flight work (leave alone):** the working tree has 3 modified files
(`package.json` → 0.8.3, `src/client.ts`, `src/server.ts`) adding `seoTitle` /
`seoDescription` to `get_article`, plus untracked `.DS_Store` and a re-added
`Substack Article MCP.zip`. This is someone's unfinished 0.8.3 change — do not
commit, revert, or build on it without asking.

## Rules (read before acting)
1. **Do not present this MCP as working.** It is known-broken as of 2026-03-15.
   Any "it works" claim must come from a fresh install + auth test you actually ran.
2. **Leave the dirty tree alone.** The uncommitted 0.8.3 SEO-field work is in-flight;
   do not sweep it into a commit or revert it.
3. **Never commit a real Substack cookie.** Auth is a `substack.sid` (+ `substack.lli`
   for paid) cookie stored in `~/.substack-article-mcp/auth.json` or passed via the
   `SUBSTACK_COOKIE` env var — never in the repo.
4. **The `.mcpb` bundle is 33 MB** (bundles `puppeteer-core` + deps). Rebuilding it is
   a deliberate release step (`.mcpbignore` controls contents), not a routine edit.
5. **`dist/` is compiled output** from `src/` via `tsc` — edit `src/`, then `npm run
   build`. Do not hand-edit `dist/`.

## Architecture
```
AI client (Cursor / Claude Code / Claude Desktop)
   │  stdio subprocess
   ▼
dist/index.js  (bin: substack-article-mcp)
   ├── src/index.ts    ← CLI entry: install / login / --check / --version, else start server
   ├── src/server.ts   ← MCP server: tool registration (list/get/search articles, comments, feed…)
   ├── src/client.ts   ← Substack internal-API client + response normalization
   ├── src/auth.ts     ← cookie resolution (SUBSTACK_COOKIE env > ~/.substack-article-mcp/auth.json), Chrome login via puppeteer-core
   ├── src/setup.ts    ← writes client config (Cursor / Claude Code mcp entries)
   └── src/html-to-md.ts ← article HTML → markdown (cheerio)

Distribution artifacts:
   manifest.json                 ← .mcpb descriptor (Claude Desktop): mcp_config + user_config
   substack-article-mcp.mcpb     ← 33 MB Claude Desktop bundle (built 2026-03-15, v0.8.2)
   package.json bin              ← npm: `npx substack-article-mcp ...`
```
Auth priority (from `src/auth.ts`): `SUBSTACK_COOKIE` env var → `~/.substack-article-mcp/auth.json` → no auth (public only).

**Auth mechanism (the known-broken `.mcpb` path).** `manifest.json` `server.mcp_config`
launches the bundle as `command: "node"`, `args: ["${__dirname}/dist/index.js"]`,
`env: { SUBSTACK_COOKIE: "${user_config.substack_cookie}" }`. So the Desktop bundle
passes the cookie by env var to a **direct node process** (not an `npx` subprocess —
the earlier "env var to npx subprocess" suspicion does not match the current
manifest). The reported failure is that a cookie pasted in Extension settings does
not authenticate. Re-verify whether `${user_config.substack_cookie}` is actually
substituted into the env at launch, and whether `src/auth.ts` reads it correctly, as
the first debugging step.

No `_index.md` files: `src/` and `dist/` are code dirs, not agent-navigable hubs.

## Gotchas
1. **Known-broken (2026-03-15).** Install, npm description, and `.mcpb` auth all
   suspect. Verify before recommending.
2. **Version drift** — `package.json` (0.8.2 committed / 0.8.3 working), `manifest.json`
   (0.8.2), and the built `.mcpb` (0.8.2) can disagree. Check all three before a release.
3. **`.mcpb` is 33 MB** — a git-committed binary. Rebuilds are release events.
4. **Running `npx -y substack-article-mcp` with no args starts the stdio server** and
   the terminal appears to hang. The client is supposed to launch it, not a human.
5. **Chrome required only for `login` / `install`** (puppeteer-core drives a dedicated
   Chrome profile), not for the Claude Desktop bundle at runtime.
6. **`dist/` is committed** and may lag `src/` — the source of truth is `src/`.

## Stack
- TypeScript 5.5, ESM (`"type": "module"`), Node ≥18
- `@modelcontextprotocol/sdk` ^1.26, `cheerio` ^1.0, `puppeteer-core` ^24, `zod` ^3.23
- Build: `tsc` → `dist/`. Dev: `tsx src/index.ts`.

## Commands
- `npm run build` — compile `src/` → `dist/`
- `npm run dev` — run from source via tsx
- `npx -y substack-article-mcp install --cursor` — login + configure Cursor
- `npx -y substack-article-mcp install --claude-code` — login + add MCP globally
- `npx -y substack-article-mcp login` — refresh cookie via Chrome flow
- `npx -y substack-article-mcp login --check` — auth status + cookie age

## Conventions
- Edit `src/`, rebuild `dist/` with `npm run build`; never hand-edit `dist/`.
- `.mcpb` rebuild is a release step controlled by `.mcpbignore`.
- Cookie lives outside the repo (`~/.substack-article-mcp/auth.json` or env).

## Recent changes
- 2026-03-15: bumped `manifest.json` to 0.8.2, rebuilt `.mcpb` (`2a5ad47`) — last commit.
- 2026-03-15: added video transcript + media fields to `get_article` (`3df3629`).
- 2026-02..03: substack_login tool, optional-auth/per-client install, mcpb bundling.
- (uncommitted) 0.8.3 work-in-progress adding SEO title/description to `get_article`.

## Open questions (verification steps — nothing here is confirmed working)
- **Does it install cleanly today?** Run `npx -y substack-article-mcp install
  --claude-code` in a clean shell and observe.
- **Is the npm description actually wrong?** Compare the live npm registry page for
  `substack-article-mcp` against this `package.json` description.
- **Why does `.mcpb` auth fail?** Confirm whether Claude Desktop substitutes
  `${user_config.substack_cookie}` into `SUBSTACK_COOKIE` at launch, then whether
  `src/auth.ts` (`loadAuth`, line ~60) reads it. Reproduce with a real cookie.
- **Ship the 0.8.3 dirty work or discard it?** (SEO fields in `get_article`.)

## Environment
- Local Mac, `~/Documents/apps/substack-article-mcp/`
- Remote: `git@github.com:jenny-ouyang/substack-article-mcp.git` (has releases page)
- Runtime cookie: `~/.substack-article-mcp/auth.json` or `SUBSTACK_COOKIE` env (never in repo)
