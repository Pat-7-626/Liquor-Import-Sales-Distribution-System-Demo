-- Repeated wrong passwords lock an account for a while.
alter table users
  add column failed_logins integer     not null default 0,
  add column locked_until  timestamptz;
