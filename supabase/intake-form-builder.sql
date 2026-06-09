-- ────────────────────────────────────────────────────────────────────
-- intake_forms — Phase 1 of the Client Intake Form rebuild.
--
-- Extends the existing intake_forms table with the columns the
-- new form builder needs. Everything is jsonb / nullable / has a
-- default, so existing rows (using the legacy `sections` column)
-- keep working without migration. New forms write to `questions`,
-- `branding`, and `settings`.
--
-- Safe to run more than once — every column add uses IF NOT EXISTS.
-- ────────────────────────────────────────────────────────────────────

create extension if not exists "pgcrypto";

-- ── New form-builder columns ───────────────────────────────────────
alter table intake_forms
  -- The full flat question array. One JSON object per question with
  -- shape:
  --   { id, text, helper_text, type, required, options[], scale_low_label,
  --     scale_high_label, conditional_rules[], order_index, locked }
  -- See src/lib/intakeQuestionSets.js for the default sets per type.
  add column if not exists questions jsonb default '[]'::jsonb,

  -- Branding shown on the client-facing form + delivery email:
  --   { logo_url, primary_color, welcome_message, completion_message }
  add column if not exists branding jsonb default '{}'::jsonb,

  -- Form settings:
  --   { file_uploads_enabled, language, show_progress_bar,
  --     send_confirmation_email, send_designer_notification }
  -- The estimated-completion time is derived live in the builder
  -- from question count × 45s; never persisted because it would go
  -- stale the moment a question is added or removed.
  add column if not exists settings jsonb default '{}'::jsonb,

  -- Lifecycle timestamps.
  add column if not exists expires_at   timestamptz,
  add column if not exists published_at timestamptz,
  add column if not exists updated_at   timestamptz default now();

-- ── Status enum (text + check) ─────────────────────────────────────
-- The legacy default was 'sent' / 'pending'. New builder uses
-- 'draft' until Publish is clicked, then 'active', then 'expired'
-- once expires_at passes. Old values stay valid; no rewrite needed.
do $$ begin
  -- noop block — the check constraint stays loose because we don't
  -- want to break legacy rows that have other status strings.
  null;
end $$;

-- ── updated_at touch trigger ───────────────────────────────────────
create or replace function intake_forms_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists intake_forms_touch_trigger on intake_forms;
create trigger intake_forms_touch_trigger
  before update on intake_forms
  for each row execute function intake_forms_touch();

-- ── Tracking opens + submission counts ─────────────────────────────
-- These get incremented by the public client form (opens) and the
-- submit endpoint (submissions). Stored on the form row directly so
-- the delivery status panel can render them with one query.
alter table intake_forms
  add column if not exists open_count       integer default 0,
  add column if not exists submission_count integer default 0;
