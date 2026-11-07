# Supabase database workflow

`supabase/*.sql` contains the historical bootstrap scripts. Do not run those
files automatically against an established project.

New production changes belong in the root `migrations/` directory with the
next four-digit sequence. Add a stable timestamp for the new sequence in
`scripts/sync-supabase-migrations.mjs`, then run:

```bash
npm run db:prepare
npm run db:status
npm run db:push
```

`db:prepare` creates the timestamped files expected by the Supabase CLI.
`db:push` records applied versions in Supabase's migration history, so a
deployment cannot silently replay the same change.

The `migrations` CI job runs after the application checks on pushes to `main`
when the repository variable `SUPABASE_MIGRATIONS_ENABLED` is set to `true`.
Before enabling it, configure `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`,
and `SUPABASE_DB_PASSWORD` as GitHub environment secrets for `production`.

For a brand-new local database, apply `schema.sql` and the other historical
bootstrap scripts intentionally, then use the numbered migration workflow for
all subsequent changes.
