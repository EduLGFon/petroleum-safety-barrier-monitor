-- ═══════════════════════════════════════════════════════════════════════════
-- SCHEMA — Monitor de Barreiras
-- ═══════════════════════════════════════════════════════════════════════════
-- Every lookup table's ids are a hard contract with the frontend's
-- lib/enums.ts resolvers (fromXId/toXId) — a given id must mean the exact
-- same thing on both sides. Rows are seeded by db/seed_lookups.sql with the
-- ids matching lib/enums.ts exactly; do not renumber existing rows.
--
-- Run this once against a fresh database:
--   deno task db:migrate
-- which executes this file followed by db/seed_lookups.sql.

-- ─── Lookup tables (id ⇄ label pairs, mirrored in lib/enums.ts) ───────────

create table if not exists locations (
  id    integer primary key,
  code  text not null unique,          -- 'FAL','CNC','CNS','FAP','RJO','SPL' ('ALL' is UI-only, never a row)
  tipo  text not null                   -- installation type, display only
);

create table if not exists disponibilidades (
  id          integer primary key,
  label       text    not null unique,
  is_conforme boolean not null          -- drives barriers.conformidade_id via trigger
);

create table if not exists criticidades (
  id    integer primary key,
  label text not null unique
);

create table if not exists categorias (
  id    integer primary key,
  label text not null unique
);

create table if not exists agrupamentos (
  id    integer primary key,
  label text not null unique
);

create table if not exists tipologias (
  id    integer primary key,
  label text not null unique
);

create table if not exists donos (
  id    integer primary key,           -- -1 = "não informado" is NOT a row here;
  label text not null unique            -- donoId = -1 means "no row", handled in application code
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
  tipologia_id       integer    not null references tipologias(id),
  loc_desc_id        integer    not null references loc_descs(id),
  criticidade_id     integer    not null references criticidades(id),
  categoria_id       integer    not null references categorias(id),
  agrupamento_id     integer    not null references agrupamentos(id),
  dono_id            integer    references donos(id),        -- null = "não informado"

  disponibilidade_id integer    not null references disponibilidades(id),

  -- Derived, never written directly — kept in sync with disponibilidade_id
  -- by the trg_barriers_set_conformidade trigger below (mirrors
  -- lib/constants.ts's isConforme()). This can't be a native PostgreSQL
  -- GENERATED column because that syntax forbids subqueries/joins, and the
  -- conforming-status set lives in the disponibilidades lookup table rather
  -- than a hardcoded literal list, so a trigger is the mechanism instead.
  conformidade_id    integer    not null default 1,

  comentarios        text        not null default '',
  plano_acao         text        not null default '',

  status_since       date        not null default current_date,

  -- Provenance + soft delete (Fracttal sync, P3). external_code is the
  -- stable upstream business key used for upsert matching — never renumber.
  external_code       text        unique,
  source_updated_at   timestamptz,          -- best-available remote timestamp; null when upstream exposes none
  deleted_at          timestamptz,          -- set by sync when the upstream row disappears; row stays for audit

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists idx_barriers_external_code on barriers(external_code);
create index if not exists idx_barriers_deleted_at on barriers(deleted_at);

create or replace function barriers_set_conformidade() returns trigger as $$
begin
  select case when d.is_conforme then 0 else 1 end
    into new.conformidade_id
  from disponibilidades d
  where d.id = new.disponibilidade_id;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_barriers_set_conformidade on barriers;
create trigger trg_barriers_set_conformidade
  before insert or update of disponibilidade_id on barriers
  for each row execute function barriers_set_conformidade();

create index if not exists idx_barriers_location        on barriers(location_id);
create index if not exists idx_barriers_disponibilidade  on barriers(disponibilidade_id);
create index if not exists idx_barriers_conformidade      on barriers(conformidade_id);
create index if not exists idx_barriers_categoria        on barriers(categoria_id);
create index if not exists idx_barriers_criticidade      on barriers(criticidade_id);
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
  status_id   integer    not null references disponibilidades(id),
  author_id   integer    not null references authors(id),
  note        text        not null default '',
  created_at  timestamptz not null default now()
);

create index if not exists idx_history_barrier on barrier_status_history(barrier_id, date);

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

-- ─── Status transition — the one supported write path ──────────────────────
-- Moves a barrier to a new disponibilidade, stamps status_since to today,
-- and appends the corresponding history row, atomically. This is the only
-- sanctioned way to change a barrier's status — never UPDATE
-- disponibilidade_id directly, or status_since/history will fall out of
-- sync with it.

create or replace function record_status_change(
  p_barrier_id integer,
  p_status_id  integer,
  p_author_id  integer,
  p_note       text default ''
) returns void as $$
begin
  update barriers
     set disponibilidade_id = p_status_id,
         status_since       = current_date
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
  status_id       integer     not null references disponibilidades(id),
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
