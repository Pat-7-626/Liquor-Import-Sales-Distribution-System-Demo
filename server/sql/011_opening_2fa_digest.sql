-- A supplier's bill brought forward from before the system has no import order behind it.
alter table ap_documents alter column import_order_no drop not null;

-- Two-step sign-in (TOTP authenticator app) and the morning email summary.
alter table users
  add column totp_secret      text,
  add column totp_enabled     boolean not null default false,
  add column totp_last_step   bigint,
  add column email            text not null default '',
  add column daily_summary    boolean not null default false,
  add column last_summary_on  date;
