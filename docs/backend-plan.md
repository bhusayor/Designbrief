# Backend runtime and consolidation status

## Decision

Render/Express (`server.js`) is the primary API. Vercel hosts the React
bundle and temporarily continues to execute compatibility functions from
`api/*` for browser calls that still use relative `/api/...` URLs.

There is one implementation per shared route: `server.js` mounts the same
handlers from `api/*`. This prevents behavior drift while client call sites
are moved to `VITE_API_BASE_URL`.

## Current routing (November 2026)

| Route group | Current browser destination | Handler source |
|---|---|---|
| `/api/ai`, Pexels, web search | Render | `api/ai.js`; inline Express proxies |
| Intake processing and follow-up | Render | `intake-pipeline.js`, `api/intake-followup.js` |
| Brief review/share flow | Render | `server-lib/briefReviews.js` |
| Component/section builders and most publish calls | Render | `api/build-component.js`, `api/build-section.js`, `api/publish-build.js` |
| Settings and billing webhook | Vercel compatibility route | `api/settings.js` |
| Workspace/task persistence | Vercel compatibility route | `api/create-workspace.js` |
| Invites and team membership | Mixed; relative calls still use Vercel | `api/invite.js` |
| Intake email delivery | Vercel compatibility route | `api/send-intake-email.js` |

All compatibility handlers above are also mounted on Render. Moving a caller
therefore requires only prefixing the request with `VITE_API_BASE_URL`; it does
not require another server implementation.

Connector calls (`/api/connectors/*`) currently have client code but no checked-in
server handler. Treat them as unavailable until a connector backend is added;
do not mistake them for a Vercel-owned implementation.

## Environment contract

`VITE_API_BASE_URL` is the only browser API-origin variable. It is the Render
origin in production and `http://localhost:3001` for `npm run dev:full`.
`VITE_API_URL` is retired and must not be reintroduced.

## Builder entitlement and spend boundary

The component and website-section builders are Pro-only. Both handlers verify
the authenticated user's `profiles.plan` on the server before rate-limit checks
or any managed Codex agent call. Client-side upgrade prompts are only the user
experience layer and are not treated as authorization.

Every managed builder turn also has a 50-cent agent spend ceiling and is covered
by the per-plan daily request backstop. Builder calls do not consume the normal
direct-AI credit ledger; changing that requires an explicit product price and a
new server-owned billing policy rather than a client-supplied cost.

## Remaining consolidation work

1. Prefix the remaining relative settings, workspace, invite, intake-email,
   and legacy builder calls with the shared API base helper.
2. Verify those flows against a Render preview deployment.
3. Remove the `functions` block from `vercel.json`, then delete the Vercel
   compatibility deployment without deleting the shared handler modules.
4. Move handler modules from `api/` to `server-lib/handlers/` after Vercel no
   longer imports them.

Until step 3 is complete, changes to a compatibility route must be made in its
single `api/*.js` handler, never duplicated in `server.js`.
