# Backend consolidation plan

## Current state (July 2026)

Two backends serve overlapping surfaces:

| Surface | `server.js` (Render/Express) | `api/*` (Vercel functions) |
|---|---|---|
| Claude proxy | `/api/claude` | `api/claude.js` |
| Pexels | `/api/pexels` | `api/pexels.js` |
| Brief reviews (client review flow) | `/api/brief-reviews/*` | ❌ none |
| Web search | `/api/web-search` | ❌ none |
| Intake processing | `/api/process-intake` | partial (`intake-followup.js`, `send-intake-email.js`) |
| Invites / workspaces / settings / builds | ❌ none | `invite.js`, `create-workspace.js`, `settings.js`, `build-*.js`, `publish-build.js` |

The client sends everything to `VITE_API_URL`, which points at the
Render server in production. That means **the Vercel functions that
duplicate server.js routes are mostly dead in production**, yet they
still get maintained (and drift: the 8096-token clamp was fixed in
both places in July 2026 because they had already diverged).

## Risks of the split

1. **Drift.** Any fix applied to one proxy silently misses the other.
2. **Auth inconsistency.** `server-lib/authMiddleware.js` is shared,
   but the Express routes and the Vercel handlers wire it slightly
   differently.
3. **Vercel Hobby 12-function cap.** api/ has 10 functions; adding
   brief-reviews there is impossible without dropping something.
4. **Two deploy pipelines** to keep in sync for every release.

## Target state

**Consolidate on the Render Express server** (server.js), because:
- It already hosts the routes Vercel can't fit (brief-reviews).
- No 60s timeout ceiling (matters for Opus builds + long briefs).
- No function-count cap.
- One deploy, one log stream, one place to patch.

Vercel keeps ONLY static hosting of the SPA (dist/) + rewrites.

## Migration steps

1. Port the Vercel-only handlers into Express routes:
   `invite`, `create-workspace`, `settings`, `build-component`,
   `build-section`, `publish-build`, `send-intake-email`,
   `intake-followup`. Each is already a `(req, res)` handler, so the
   port is `app.post('/api/x', handler)` plus removing the per-file
   CORS boilerplate in favour of one Express-level `setCors`.
2. Point `VITE_API_URL` at the Render origin everywhere (it already
   is in prod; align dev via `npm run dev:full`).
3. Delete `api/` and the `functions` block from vercel.json.
4. Move the prompt library server-side while we're in there:
   `/api/claude` accepts `{ task_type, variables }` and the server
   assembles the prompt. Kills the "generic Claude proxy" abuse
   vector completely and takes the prompt IP out of the JS bundle.

## Interim guardrails (already shipped)

- Shared `server-lib/cors.js` origin allowlist.
- Fail-closed, plan-aware rate limiting in `authMiddleware.js`.
- task_type allowlist + payload caps + 16384 clamp in both proxies.

## Effort estimate

Steps 1-3: one focused day + a deploy dry-run.
Step 4 (prompts server-side): 2-3 days, riskier; do it after 1-3 are
stable in production.
