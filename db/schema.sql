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
  code  text not null unique,          -- 'FAL','SML','FSR','IBU','FSL','CNC','JCT','FSJ' ('ALL' is UI-only, never a row)
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

  -- Sheet inventory columns (GERAL), admin-fillable. Fracttal does not feed
  -- them (null = "não informado"); the import writes nulls, later syncs and
  -- admin edits fill them in. All free text, never FKs.
  origin             text,                  -- Origem (HAZOP/APR reference)
  install_local      text,                  -- Local de Instalação
  equip_typology     text,                  -- Tipologia Equipamento
  field_installed    text,                  -- Elemento Instalado em Campo? (Sim/Não)
  field_operational  text,                  -- Elemento Encontra-se Operacional? (Sim/Não)
  op_status          text,                  -- Status de Disponibilidade (Operacional)
  has_maint_plan     text,                  -- Possui Plano de Manutenção? (Sim/Não/Verificar)
  plan_followed      text,                  -- Plano de Manutenção Sendo Cumprido? (Sim/Não/Verificar)
  failure_free       text,                  -- Ausência de Falha ou Defeito? (Sim/Não/Verificar)
  maint_status       text,                  -- Status de Disponibilidade (Manutenção)
  has_contingency    text,                  -- Há Contingência? (Sim/Não)
  contingency_desc   text,                  -- Descrição da Contingência
  evidence_code      text,                  -- Código da Evidência
  degradation_desc   text,                  -- Descrição da Degradação/indisponibilidade
  extra_comments     text,                  -- Comentários2

  status_since       date        not null default current_date,

  -- Provenance + soft delete (Fracttal sync, P3). external_code is the
  -- stable upstream business key used for upsert matching - never renumber.
  -- NOT NULL: every barrier row must carry its upstream key so reconcile
  -- can match it (NULLs would be invisible to loadLocal and could
  -- duplicate on the next sync). Local-only rows do not exist yet; if one
  -- is ever added it needs a stable synthetic code, not NULL.
  external_code       text        not null unique,
  source_updated_at   timestamptz,          -- best-available remote timestamp; null when upstream exposes none
  deleted_at          timestamptz,          -- set by sync when the upstream row disappears; row stays for audit

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  -- Upstream enable flag (Fracttal `active`). False means the source
  -- disabled the asset; the row stays visible behind the admin Situacao
  -- filter instead of vanishing. Sync and import maintain it.
  is_active          boolean     not null default true
);

create index if not exists idx_barriers_external_code on barriers(external_code);
create index if not exists idx_barriers_deleted_at on barriers(deleted_at);
-- NOTE: indexes on later-added columns must be created AFTER their
-- ALTER TABLE ... ADD COLUMN stanza below. An index placed here fails on
-- pre-existing databases, where CREATE TABLE IF NOT EXISTS is a no-op and
-- the column does not exist yet (see idx_barriers_is_active).

-- Later-added sheet columns ride along idempotently (same pattern as
-- locations.name above) so existing databases gain them on next migrate.
alter table barriers add column if not exists origin text;
alter table barriers add column if not exists install_local text;
alter table barriers add column if not exists equip_typology text;
alter table barriers add column if not exists field_installed text;
alter table barriers add column if not exists field_operational text;
alter table barriers add column if not exists op_status text;
alter table barriers add column if not exists has_maint_plan text;
alter table barriers add column if not exists plan_followed text;
alter table barriers add column if not exists failure_free text;
alter table barriers add column if not exists maint_status text;
alter table barriers add column if not exists has_contingency text;
alter table barriers add column if not exists contingency_desc text;
alter table barriers add column if not exists evidence_code text;
alter table barriers add column if not exists degradation_desc text;
alter table barriers add column if not exists extra_comments text;
-- Upstream enable flag rides along idempotently like the sheet columns so
-- existing databases gain it on the next migrate (default true = enabled).
alter table barriers add column if not exists is_active boolean not null default true;
create index if not exists idx_barriers_is_active on barriers(is_active);

-- Pre-existing databases created external_code as nullable: enforce the
-- NOT NULL contract idempotently. Fail-closed when legacy NULL rows
-- exist (Postgres raises naming the column) so the owner resolves them
-- with stable synthetic codes instead of silently duplicating later.
alter table barriers alter column external_code set not null;

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
-- Filter/sort columns without an index were full scans as the table grows
-- (typologyId filter in lib/server/sql/where.ts, owner sort in SORTABLE).
-- Additive only, no query or contract change. See DECISIONS.md#D01.
create index if not exists idx_barriers_typology        on barriers(typology_id);
create index if not exists idx_barriers_owner           on barriers(owner_id);
-- Plain btree on tag (equality + prefix LIKE). Named *_tag on purpose: a
-- trigram GIN index would be needed for real %q% search (pg_trgm), which this
-- schema deliberately does not require. Drops the legacy misleading name.
drop index if exists idx_barriers_tag_trgm;
create index if not exists idx_barriers_tag              on barriers using btree (tag);
create index if not exists idx_barriers_status_since     on barriers(status_since);

-- Scope provenance per barrier (which gate admitted the row: keyword, eso,
-- keyword+eso, all). Added with the ESO-OR-keyword scope so narrowing the
-- scope later stays reversible; the sync rewrites it on every touch.
alter table barriers add column if not exists scope_source text not null default '';

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
-- Alert scan in lib/server/sql/alerts.ts orders by (date, id) with no
-- barrier filter. Additive only, result order unchanged. See DECISIONS.md#D01.
create index if not exists idx_history_date_id on barrier_status_history(date desc, id desc);

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
  -- Marks this transaction as a sanctioned status write so the guard
  -- trigger below lets the UPDATE through. Transaction-local: it never
  -- leaks past COMMIT/ROLLBACK.
  perform set_config('app.status_write', 'on', true);
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

-- ─── Status write guard - DB enforcement of the one write path ──────────
-- Rejects any direct UPDATE of barriers.availability_id that did not go
-- through record_status_change() (which sets app.status_write first).
-- Without this the "only sanctioned way" rule is convention only, and a
-- future code path could move availability without stamping status_since
-- or history. INSERTs are unaffected (trigger is UPDATE-only), as are
-- sync field writes (they never touch availability_id). Manual repair
-- remains possible by setting the GUC first in the same transaction.
create or replace function guard_availability_write() returns trigger as $$
begin
  if current_setting('app.status_write', true) is distinct from 'on' then
    raise exception 'direct UPDATE of barriers.availability_id forbidden; use record_status_change()';
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_guard_availability_write on barriers;
create trigger trg_guard_availability_write
  before update of availability_id on barriers
  for each row execute function guard_availability_write();

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
-- Poll lock queries filter (scope, status, heartbeat finished_at) in
-- lib/server/sql/sync.ts (syncScopeRunning, reapStaleRuns, getSyncStatus).
-- Additive only, existing index kept. See DECISIONS.md#D01.
create index if not exists idx_sync_state_scope_status on sync_state(scope, status, finished_at desc);

-- Single running lease per scope, DB-enforced: two racing pollers must not
-- both open a run. startRun() still checks first (fast path to ScopeBusy
-- without an error), and the index turns the race into a unique violation
-- which startRun maps to ScopeBusyError. Superseded duplicates (keeps the
-- newest) are failed first so the index builds on pre-existing DBs.
update sync_state set status = 'failed',
  finished_at = now(),
  note = 'dedup: superseded running row (uniqueness migration)'
  where id in (
    select id from (
      select id, row_number() over (partition by scope order by id desc) as rn
        from sync_state where status = 'running'
    ) s where rn > 1
  );
create unique index if not exists uniq_sync_state_running_scope
  on sync_state(scope) where status = 'running';

-- ─── Per-barrier sync changes (what changed, per run, per barrier) ─────────
-- One row per barrier touched by a run (insert / update / restore / delete).
-- This is why it exists: sync_state holds only counts, and
-- barrier_status_history only records status flips by the sync author.
-- Field-only updates would otherwise be invisible, and the dashboard could
-- never explain "what changed on barrier X" without loading everything.
-- changed_fields names the SignatureSource keys that differed
-- (tag, locationId, typologyId, locDescId, criticalityId, categoryId,
-- groupingId, ownerId, comments, actionPlan, isActive, scopeSource) plus
-- "availabilityId" when the status flipped. Snapshots are compact JSON with
-- the same keys plus availabilityId, so the detail view renders before/after
-- without a second lookup. Rows are written by applyPlan() in
-- lib/server/sql/sync.ts; old runs simply have no rows (detail unavailable).
create table if not exists sync_barrier_changes (
  id                integer generated always as identity primary key,
  run_id            integer     not null references sync_state(id) on delete cascade,
  barrier_id        integer     not null references barriers(id) on delete cascade,
  kind              text        not null,              -- new | updated | restored | removed
  old_availability_id integer,
  new_availability_id integer,
  changed_fields    jsonb       not null default '[]'::jsonb,
  old_snapshot      jsonb       not null default '{}'::jsonb,
  new_snapshot      jsonb       not null default '{}'::jsonb,
  created_at        timestamptz not null default now()
);

create index if not exists idx_sync_changes_run on sync_barrier_changes(run_id, barrier_id);
create index if not exists idx_sync_changes_barrier on sync_barrier_changes(barrier_id, created_at desc);
create index if not exists idx_sync_changes_created on sync_barrier_changes(created_at desc);

-- One audit row per (run, barrier): retries of the same run must not
-- double-insert. insertAuditBatch/recordBarrierChange rely on this with
-- ON CONFLICT DO NOTHING. The DELETE removes legacy duplicates (keeps
-- the earliest row) so the unique index builds on pre-existing DBs.
delete from sync_barrier_changes a using sync_barrier_changes b
  where a.run_id = b.run_id and a.barrier_id = b.barrier_id and a.id > b.id;
create unique index if not exists uniq_sync_changes_run_barrier
  on sync_barrier_changes(run_id, barrier_id);

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
-- watermark() takes max(transition_date); countRuleEvents() filters
-- (barrier_id, created_at). Additive only, no query change. See DECISIONS.md#D01.
create index if not exists idx_alert_events_transition
  on alert_events(transition_date desc);
create index if not exists idx_alert_events_barrier_created
  on alert_events(barrier_id, created_at desc);

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
--
-- Extended scope (nullable integer[] = "all"): category_ids, from_status_ids
-- (transition source, null = any), to_status_ids (multi landing statuses),
-- location_ids, criticality_ids (explicit ranks; critical_only = [ESO, A]
-- when the array is null), typology_ids, grouping_ids, owner_ids.
-- urgency gates the computed urgency ('any' | 'urgent' | 'critical');
-- only_no_action_plan limits to barriers without an action plan;
-- on_transition = false makes a stale-reminder-only rule. Anti-noise:
-- cooldown_minutes (per barrier per rule), max_per_day, quiet hours
-- (UTC hours, overnight ranges wrap), active_days (0 = Sunday), validity
-- window (valid_from/valid_to), stale_repeat_days. priority orders
-- first-match wins (higher first, then lower id). description documents
-- intent; last_triggered_at records the last fire (best-effort).
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
  description       text        not null default '',
  category_ids      integer[],
  from_status_ids   integer[],
  to_status_ids     integer[],
  location_ids      integer[],
  criticality_ids   integer[],
  typology_ids      integer[],
  grouping_ids      integer[],
  owner_ids         integer[],
  urgency           text        not null default 'any'
    check (urgency in ('any', 'urgent', 'critical')),
  only_no_action_plan boolean   not null default false,
  on_transition     boolean     not null default true,
  cooldown_minutes  integer
    check (cooldown_minutes is null or cooldown_minutes > 0),
  max_per_day       integer
    check (max_per_day is null or max_per_day > 0),
  quiet_start_hour  integer
    check (quiet_start_hour is null or (quiet_start_hour >= 0 and quiet_start_hour <= 23)),
  quiet_end_hour    integer
    check (quiet_end_hour is null or (quiet_end_hour >= 0 and quiet_end_hour <= 23)),
  active_days       integer[],
  priority          integer     not null default 0,
  valid_from        date,
  valid_to          date,
  stale_repeat_days integer
    check (stale_repeat_days is null or stale_repeat_days > 0),
  last_triggered_at timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table alert_rules add column if not exists description text not null default '';
alter table alert_rules add column if not exists category_ids integer[];
alter table alert_rules add column if not exists from_status_ids integer[];
alter table alert_rules add column if not exists to_status_ids integer[];
alter table alert_rules add column if not exists location_ids integer[];
alter table alert_rules add column if not exists criticality_ids integer[];
alter table alert_rules add column if not exists typology_ids integer[];
alter table alert_rules add column if not exists grouping_ids integer[];
alter table alert_rules add column if not exists owner_ids integer[];
alter table alert_rules add column if not exists urgency text not null default 'any';
alter table alert_rules add column if not exists only_no_action_plan boolean not null default false;
alter table alert_rules add column if not exists on_transition boolean not null default true;
alter table alert_rules add column if not exists cooldown_minutes integer;
alter table alert_rules add column if not exists max_per_day integer;
alter table alert_rules add column if not exists quiet_start_hour integer;
alter table alert_rules add column if not exists quiet_end_hour integer;
alter table alert_rules add column if not exists active_days integer[];
alter table alert_rules add column if not exists priority integer not null default 0;
alter table alert_rules add column if not exists valid_from date;
alter table alert_rules add column if not exists valid_to date;
alter table alert_rules add column if not exists stale_repeat_days integer;
alter table alert_rules add column if not exists last_triggered_at timestamptz;

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'alert_rules_urgency_check'
  ) then
    alter table alert_rules
      add constraint alert_rules_urgency_check
      check (urgency in ('any', 'urgent', 'critical'));
  end if;
end $$;

create index if not exists idx_alert_rules_active on alert_rules(active);
create index if not exists idx_alert_rules_category on alert_rules(category_id);
create index if not exists idx_alert_rules_priority on alert_rules(priority desc, id);

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
-- Sweeps filter on reset_at. Additive only. See DECISIONS.md#D01.
create index if not exists idx_throttle_reset on throttle_buckets(reset_at);

-- ─── Field option sets (admin-curated answers for sheet questions) ─────────
-- One row per barrier details field: admins settle default options in
-- Settings and the barrier editor offers them. Rows seed from the GERAL
-- extraction (see scripts/sheet-options.json) on first read, so a fresh
-- database already suggests real workbook values.
create table if not exists field_option_sets (
  field      text        not null primary key,
  options    jsonb       not null default '[]'::jsonb,
  updated_by text        not null default '',
  updated_at timestamptz not null default now()
);
