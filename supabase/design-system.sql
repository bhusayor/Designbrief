-- ────────────────────────────────────────────────────────────────────
-- Project Design System — the source of truth that every AI call
-- inside a project reads from. One row per project_id (enforced by
-- the unique index below).
--
-- The columns mirror the fields in src/lib/designSystem.js#DEFAULT_
-- DESIGN_SYSTEM so the round-trip serialise → save → load is lossless.
-- Strings + integers for scalars; jsonb for the array/object fields
-- (colors, font weights, tone keywords).
-- ────────────────────────────────────────────────────────────────────

create table if not exists design_systems (
  id            uuid primary key default gen_random_uuid(),
  project_id    text references projects(id) on delete cascade,
  workspace_id  text,
  user_id       uuid references auth.users(id),

  -- Colors — array of { id, hex, name, role }
  colors        jsonb default '[]'::jsonb,

  -- Typography
  heading_font            text,
  heading_weights         jsonb default '["700","800"]'::jsonb,
  body_font               text,
  body_weights            jsonb default '["400","500"]'::jsonb,
  base_font_size          integer default 16,
  scale_ratio             text    default '1.25',
  letter_spacing_headings text    default '-0.03em',
  letter_spacing_body     text    default '0em',
  letter_spacing_labels   text    default '0.08em',

  -- Buttons
  button_radius           text    default 'rounded',
  button_radius_value     integer default 8,
  button_size             text    default 'medium',
  button_style            text    default 'filled',
  button_weight           text    default '600',

  -- Icons (Phase 2)
  icon_library            text    default 'lucide',
  icon_style              text    default 'outline',
  icon_size_sm            integer default 16,
  icon_size_md            integer default 20,
  icon_size_lg            integer default 24,
  custom_icon_url         text,

  -- Spacing (Phase 2)
  base_unit               integer default 4,
  border_radius_sm        integer default 4,
  border_radius_md        integer default 8,
  border_radius_lg        integer default 16,
  border_radius_full      integer default 9999,
  max_content_width       integer default 1280,
  grid_columns            integer default 12,
  gutter                  integer default 24,

  -- Brand voice (Phase 2)
  tone_keywords           jsonb   default '[]'::jsonb,
  copy_style              text    default 'conversational',
  things_to_avoid         text,

  -- Imagery (Phase 2)
  photography_style       text    default 'lifestyle',
  image_treatment         text    default 'full_color',
  illustration_style      text    default 'none',

  -- Animation (Phase 2)
  motion_style            text    default 'subtle',
  easing_preference       text    default 'smooth',

  -- Shadows (Phase 2)
  shadow_style            text    default 'medium',
  shadow_color_tint       text    default 'black',

  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- One design system per project. Upsert in the panel relies on this.
create unique index if not exists design_systems_project_id_unique
  on design_systems(project_id);

create index if not exists design_systems_user_idx
  on design_systems(user_id);

-- ── RLS ─────────────────────────────────────────────────────────────
alter table design_systems enable row level security;

drop policy if exists "Users manage own design systems" on design_systems;
create policy "Users manage own design systems"
  on design_systems for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ── updated_at trigger ─────────────────────────────────────────────
create or replace function design_systems_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists design_systems_touch_trigger on design_systems;
create trigger design_systems_touch_trigger
  before update on design_systems
  for each row execute function design_systems_touch();
