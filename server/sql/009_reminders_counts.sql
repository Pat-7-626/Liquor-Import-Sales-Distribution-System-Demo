-- Payment reminders sent to customers with overdue invoices.
create table ar_reminders (
  id             text primary key,
  customer_id    text not null references customers (customer_id),
  date           date not null,
  level          integer not null check (level in (1, 2, 3)),
  overdue_amount numeric(16,2) not null,
  note           text not null default '',
  actor          jsonb not null
);
create index ar_reminders_customer_idx on ar_reminders (customer_id, date desc);

-- Stock counts: what each lot in a warehouse should hold when the count started, and what was counted.
create table stock_counts (
  count_no   text primary key,
  warehouse  text not null,
  date       date not null,
  status     text not null check (status in ('open', 'posted', 'cancelled')),
  lines      jsonb not null,
  note       text not null default '',
  created_by jsonb not null,
  posted_by  jsonb,
  posted_on  date
);

-- Where invoices, statements and reminders are emailed.
alter table customers add column email text not null default '';
