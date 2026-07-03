# DesignBrief AI

Turns messy client briefs into a 22-chapter Design Intelligence
Document, a client review loop, and an implementation backlog —
powered by Claude.

## Stack

- **Frontend:** React 19 + Vite, no router library (section-based
  navigation via AppContext), inline-styled components + Tailwind.
- **Backend:** Express (`server.js`, deployed on Render) is the
  primary API. `api/*` Vercel functions duplicate part of it and are
  being retired — see `docs/backend-plan.md`.
- **Data:** Supabase (auth, Postgres + RLS, storage). Schema lives in
  `supabase/*.sql` (historical, run-once files) and `migrations/`
  (numbered, run in order in the SQL editor).
- **AI:** Anthropic API via the server-side proxy. Model routing per
  task in `src/lib/models.js`.
- **Email:** Resend. **Payments:** Flutterwave.

## Local development

```bash
npm install
cp .env.example .env   # fill in the values below
npm run dev:full       # Express API on :3001 + Vite on :5173
```

### Environment variables

| Var | Where | Purpose |
|---|---|---|
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | client | Supabase client |
| `VITE_API_URL` | client | API origin (Render URL in prod, `http://localhost:3001` in dev) |
| `VITE_APP_URL` | client + server | public app origin (share links, CORS allowlist) |
| `SUPABASE_SERVICE_ROLE_KEY` | server only | privileged Supabase access |
| `ANTHROPIC_API_KEY` | server only | Claude |
| `PEXELS_API_KEY` | server only | moodboard imagery |
| `APP_ORIGIN_EXTRA` | server, optional | comma-separated extra CORS origins (previews) |

Never prefix a secret with `VITE_` — those are compiled into the
public JS bundle.

## Key directories

```
src/lib/briefV3Schema.js      22-chapter document schema
src/lib/briefV3Translator.js  section prompts + wave orchestrator
src/lib/briefV3Backlog.js     inventory → epics → stories engine
src/components/brief/         V2 + V3 brief renderers
src/components/backlog/       backlog view
src/pages/ClientBriefReview   public client review page (/review/:token)
server-lib/                   shared auth / CORS / email / review handlers
migrations/                   numbered SQL migrations (run in order)
docs/backend-plan.md          backend consolidation plan
```

## Deploying

1. **Migrations first:** run any new `migrations/NNNN_*.sql` in the
   Supabase SQL editor.
2. **Frontend:** push to `main`; Vercel builds `dist/` and serves the
   SPA with rewrites from `vercel.json`.
3. **API:** Render auto-deploys `server.js` from `main`.

## Conventions

- No em/en dashes in AI output or UI copy (enforced by scrubbers in
  the translators).
- Vercel Hobby plan: max 12 serverless functions (`api/` has 10; do
  not add more — new endpoints go in `server.js`).
- Credits are deducted via the `deduct_credits` Postgres RPC; the
  cost table lives in `migrations/0012_credit_lockdown.sql`, and the
  client-side `CREDIT_COSTS` map is display-only.
