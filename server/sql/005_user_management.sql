-- User management: accounts can be disabled (kept for the audit history, never deleted), carry sign-in and
-- password dates, can be required to change a temporary password, and have a token version that is bumped
-- to sign the user out everywhere (password change, reset, or disabling).
alter table users
  add column active               boolean     not null default true,
  add column created_at           timestamptz not null default now(),
  add column last_login_at        timestamptz,
  add column password_changed_at  timestamptz,
  add column must_change_password boolean     not null default false,
  add column token_version        integer     not null default 0;
