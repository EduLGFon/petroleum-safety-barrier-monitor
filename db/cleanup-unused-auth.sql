-- Cleanup: abandoned e-mail invite / reset-link experiment.
-- The forced-password-change work once added a must_change_password column
-- and a password_resets table. must_change_password is used again for
-- temporary passwords, so it must never be dropped here: this file runs on
-- every migration and a drop would silently delete the column on each deploy.
-- No application code reads last_login_at or password_resets: account
-- recovery is the admin-only PATCH /api/users/:id path plus self-service
-- POST /api/auth/password.
-- Kept idempotent so pre-existing databases lose the dead objects on the next
-- `deno task db:migrate` (fresh databases never create them because they are
-- absent from db/schema.sql). This is a one-off: once every deployed database
-- has migrated, delete this file and the applyFile() line in
-- scripts/migrate.ts so a future feature can reuse a name.
alter table users drop column if exists last_login_at;
drop table if exists password_resets;
