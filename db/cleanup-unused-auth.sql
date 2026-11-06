-- ─── Cleanup: abandoned e-mail invite / reset-link experiment ──────────────
-- The reset-link and forced-password-change work briefly added these objects.
-- No application code reads them: account recovery is the admin-only
-- PATCH /api/users/:id path plus self-service POST /api/auth/password.
-- Kept as an idempotent cleanup so pre-existing databases lose the dead
-- columns/table on the next `deno task db:migrate` (fresh databases never
-- create them because they are absent from db/schema.sql). This is a one-off:
-- once every deployed database has migrated, delete this file and the
-- applyFile() line in scripts/migrate.ts so a future feature can reuse a name.
-- x.1.5.1472: o DROP de must_change_password saiu daqui. A coluna voltou a
-- ser usada (senha temporaria + troca obrigatoria no primeiro acesso) e
-- este arquivo roda em TODA migracao: mante-lo apagaria a coluna a cada
-- deploy, em silencio, e o recurso morreria sem erro nenhum.
-- alter table users drop column if exists must_change_password;  -- NAO REATIVAR
alter table users drop column if exists last_login_at;
drop table if exists password_resets;
