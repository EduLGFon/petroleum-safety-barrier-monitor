-- ═══════════════════════════════════════════════════════════════════════════
-- SCHEMA - Safety Barrier Monitor
-- ═══════════════════════════════════════════════════════════════════════════
-- Every STATIC lookup table's ids (availability_statuses, criticality_levels,
-- groupings, typologies, owners, loc_descs, authors) are a hard contract with
-- the frontend's lib/enums.ts resolvers (fromXId/toXId) - a given id must mean
-- the exact same thing on both sides. Rows are seeded by db/seed_lookups.sql
-- with the ids matching lib/enums.ts exactly; do not renumber existing rows.
--
-- locations and categories are DYNAMIC instead: they mirror the real catalog
-- imported by scripts/fracttal-import.ts (see db/seed_lookups.sql), and the
-- server serves those id->label maps as the vocabulary so the UI never depends
-- on static enums for them.
--
-- Run this once against a fresh database:
--   deno task db:migrate
-- which executes this file followed by db/seed_lookups.sql.

-- ─── Lookup tables (id ⇄ label pairs, mirrored in lib/enums.ts) ───────────

create table if not exists locations (
  id    integer primary key,
  code  text not null unique,          -- 'FAL','CNC','CNS','FAP','RJO','SPL' ('ALL' is UI-only, never a row)
  type  text not null,                 -- installation type, display only
  name  text                           -- full display name (hover tooltip); null falls back to code
);

-- Later-added columns ride along idempotently so existing databases gain
-- them on the next migrate without a version table.
alter table locations add column if not exists name text;

create table if not exists availability_statuses (
  id           integer primary key,
  label        text    not null unique,
  is_compliant boolean not null          -- drives barriers.compliance_id via trigger
);

create table if not exists criticality_levels (
  id    integer primary key,
  label text not null unique
);

create table if not exists categories (
  id    integer primary key,
  label text not null unique
);

create table if not exists groupings (
  id    integer primary key,
  label text not null unique
);

create table if not exists typologies (
  id    integer primary key,
  label text not null unique
);

create table if not exists owners (
  id    integer primary key,           -- -1 = "não informado" is NOT a row here;
  label text not null unique            -- ownerId = -1 means "no row", handled in application code
);

create table if not exists loc_descs (
  id    integer primary key,
  label text not null unique
);

create table if not exists authors (
  id    integer primary key,
  name  text not null unique
);

-- ─── Barriers ──────────────────────────────────────────────────────────────

create table if not exists barriers (
  id                 integer generated always as identity primary key,
  tag                text        not null,

  location_id        integer    not null references locations(id),
  typology_id        integer    not null references typologies(id),
  loc_desc_id        integer    not null references loc_descs(id),
  criticality_id     integer    not null references criticality_levels(id),
  category_id        integer    not null references categories(id),
  grouping_id        integer    not null references groupings(id),
  owner_id           integer    references owners(id),        -- null = "não informado"

  availability_id    integer    not null references availability_statuses(id),

  -- Derived, never written directly - kept in sync with availability_id
  -- by the trg_barriers_set_compliance trigger below (mirrors
  -- lib/constants.ts's isCompliant()). This can't be a native PostgreSQL
  -- GENERATED column because that syntax forbids subqueries/joins, and the
  -- compliant status set lives in the availability_statuses lookup table
  -- rather than a hardcoded literal list, so a trigger is the mechanism
  -- instead.
  compliance_id      integer    not null default 1,

  comments           text        not null default '',
  action_plan        text        not null default '',

  status_since       date        not null default current_date,

  -- Provenance + soft delete (Fracttal sync, P3). external_code is the
  -- stable upstream business key used for upsert matching - never renumber.
  external_code       text        unique,
  source_updated_at   timestamptz,          -- best-available remote timestamp; null when upstream exposes none
  deleted_at          timestamptz,          -- set by sync when the upstream row disappears; row stays for audit

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists idx_barriers_external_code on barriers(external_code);
create index if not exists idx_barriers_deleted_at on barriers(deleted_at);

create or replace function barriers_set_compliance() returns trigger as $$
begin
  select case when d.is_compliant then 0 else 1 end
    into new.compliance_id
  from availability_statuses d
  where d.id = new.availability_id;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_barriers_set_compliance on barriers;
create trigger trg_barriers_set_compliance
  before insert or update of availability_id on barriers
  for each row execute function barriers_set_compliance();

create index if not exists idx_barriers_location        on barriers(location_id);
create index if not exists idx_barriers_availability    on barriers(availability_id);
create index if not exists idx_barriers_compliance      on barriers(compliance_id);
create index if not exists idx_barriers_category        on barriers(category_id);
create index if not exists idx_barriers_criticality     on barriers(criticality_id);
-- Plain btree on tag (equality + prefix LIKE). Named *_tag on purpose: a
-- trigram GIN index would be needed for real %q% search (pg_trgm), which this
-- schema deliberately does not require. Drops the legacy misleading name.
drop index if exists idx_barriers_tag_trgm;
create index if not exists idx_barriers_tag              on barriers using btree (tag);
create index if not exists idx_barriers_status_since     on barriers(status_since);

-- ─── Status history (one row per transition, newest last) ─────────────────

create table if not exists barrier_status_history (
  id          integer generated always as identity primary key,
  barrier_id  integer      not null references barriers(id) on delete cascade,
  date        date        not null,
  status_id   integer    not null references availability_statuses(id),
  author_id   integer    not null references authors(id),
  note        text        not null default '',
  created_at  timestamptz not null default now()
);

create index if not exists idx_history_barrier on barrier_status_history(barrier_id, date);
-- Sync card's "what changed" list filters by the sync author and orders by
-- recency; this index keeps that read cheap as history grows.
create index if not exists idx_history_sync_author on barrier_status_history(author_id, created_at desc);

-- ─── updated_at maintenance ─────────────────────────────────────────────────

create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_barriers_updated_at on barriers;
create trigger trg_barriers_updated_at
  before update on barriers
  for each row execute function set_updated_at();

-- ─── Status transition - the one supported write path ──────────────────────
-- Moves a barrier to a new availability status, stamps status_since to today,
-- and appends the corresponding history row, atomically. This is the only
-- sanctioned way to change a barrier's status - never UPDATE
-- availability_id directly, or status_since/history will fall out of
-- sync with it.

create or replace function record_status_change(
  p_barrier_id integer,
  p_status_id  integer,
  p_author_id  integer,
  p_note       text default ''
) returns void as $$
begin
  update barriers
     set availability_id = p_status_id,
         status_since    = current_date
   where id = p_barrier_id;

  if not found then
    raise exception 'barrier % does not exist', p_barrier_id;
  end if;

  insert into barrier_status_history (barrier_id, date, status_id, author_id, note)
  values (p_barrier_id, current_date, p_status_id, p_author_id, p_note);
end;
$$ language plpgsql;

-- ─── Sync state + alert events (Fracttal import, P3) ───────────────────────

-- One row per sync run: audit trail + ops diagnosis. status is
-- 'running'|'ok'|'failed'. cursor is an opaque checkpoint for resumable
-- paging once the poller is alive; counts are reconcile totals.
create table if not exists sync_state (
  id          integer generated always as identity primary key,
  scope       text        not null default 'all',
  status      text        not null,              -- running | ok | failed
  cursor      text,
  inserts     integer     not null default 0,
  updates     integer     not null default 0,
  skips       integer     not null default 0,
  deletes     integer     not null default 0,
  note        text        not null default '',
  started_at  timestamptz not null default now(),
  finished_at timestamptz not null default now()
);

create index if not exists idx_sync_state_status on sync_state(status, started_at desc);

-- Barrier alert dedup: one row per (barrier, transition date, status) so a
-- re-fired event can never double-notify. sent_at null = pending send; the
-- send path (P5) flips it after a successful notify. payload holds context
-- for the future email renderer.
create table if not exists alert_events (
  id              integer generated always as identity primary key,
  barrier_id      integer     references barriers(id) on delete set null,
  transition_date date        not null,
  status_id       integer     not null references availability_statuses(id),
  kind            text        not null default 'barrier_transition',
  dedup_key       text        not null unique,   -- barrier_id:date:status_id
  payload         jsonb       not null default '{}'::jsonb,
  sent_at         timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists idx_alert_events_unsent
  on alert_events(kind, sent_at) where sent_at is null;

-- Alert recipients (P5): who gets the urgent digest. Managed through the
-- auth-guarded /api/recipients routes; the send path only reads active rows.
create table if not exists alert_recipients (
  id         integer generated always as identity primary key,
  email      text        not null unique,
  name       text        not null default '',
  active     boolean     not null default true,
  created_at timestamptz not null default now()
);

-- ─── Users + sessions (auth, two roles: admin and user) ─────────────────────
-- Users own the dashboard login (email + password, cookie session). Role is
-- 'admin' (full access: status writes, user and alert management) or 'user'
-- (read-only dashboard). Only admins may promote others to admin or manage
-- recipients and alert rules. Passwords store a PBKDF2-SHA256 digest in the
-- `pbkdf2$iterations$salt_b64$hash_b64` format (see lib/server/auth/).
create table if not exists users (
  id            integer generated always as identity primary key,
  email         text        not null unique,   -- always stored lowercased
  name          text        not null default '',
  password_hash text        not null,
  role          text        not null default 'user' check (role in ('admin', 'user')),
  active        boolean     not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_users_role on users(role);

drop trigger if exists trg_users_updated_at on users;
create trigger trg_users_updated_at
  before update on users
  for each row execute function set_updated_at();

-- Opaque sessions: the cookie carries a random token, only its SHA-256 hash
-- is stored here. Expired rows are ignored by lookups and can be swept by a
-- periodic delete; no background job is required for correctness.
create table if not exists sessions (
  id          integer generated always as identity primary key,
  user_id     integer     not null references users(id) on delete cascade,
  token_hash  text        not null unique,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);

create index if not exists idx_sessions_user on sessions(user_id);
create index if not exists idx_sessions_expires on sessions(expires_at);

-- ─── Alert rules (which events trigger email, per category) ─────────────────
-- One row defines a trigger: transitions landing on to_status_id (null means
-- any non-compliant landing) for an optional single category (null means all
-- categories). Disabling is explicit: active = false, or no active rule
-- covering a category, means that category never alerts. critical_only limits
-- the rule to Crítica barriers; include_recovery also alerts on returns to a
-- compliant status; stale_days adds a time-based trigger (barrier stays
-- non-compliant for N days); notify_immediate sends at once instead of the
-- periodic digest (hybrid mode).
create table if not exists alert_rules (
  id                integer generated always as identity primary key,
  name              text        not null unique,
  category_id       integer     references categories(id) on delete cascade,
  to_status_id      integer     references availability_statuses(id),
  critical_only     boolean     not null default false,
  include_recovery  boolean     not null default false,
  stale_days        integer     check (stale_days is null or stale_days > 0),
  notify_immediate  boolean     not null default false,
  active            boolean     not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_alert_rules_active on alert_rules(active);
create index if not exists idx_alert_rules_category on alert_rules(category_id);

drop trigger if exists trg_alert_rules_updated_at on alert_rules;
create trigger trg_alert_rules_updated_at
  before update on alert_rules
  for each row execute function set_updated_at();

-- ─── Throttle buckets (shared rate limits across isolates) ─────────────────
-- One row per (bucket, key): fixed-window counters shared by all server
-- isolates. In-memory throttles stay as the fast path and fallback when the
-- DB is unreachable; the export route prefers this table so multi-isolate
-- deploys share one budget instead of one per isolate.
create table if not exists throttle_buckets (
  bucket    text        not null,
  key       text        not null,
  count     integer     not null default 1,
  reset_at  timestamptz not null,
  primary key (bucket, key)
);