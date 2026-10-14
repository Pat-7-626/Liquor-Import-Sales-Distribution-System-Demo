-- Running the books: when they start and with how much cash, closed months, operating expenses with
-- withholding tax, manual journals, bank statements for reconciliation, quotations, purchase requests.

-- Existing databases keep the figures they were started with (previously fixed in code).
alter table company
  add column opening_date   date not null default '2026-04-30',
  add column opening_bank   numeric(16,2) not null default 4000000 check (opening_bank >= 0),
  add column closed_through date;

create table expenses (
  doc_no       text primary key,
  date         date not null,
  payee        text not null,
  payee_tax_id text not null default '',
  payee_type   text not null check (payee_type in ('company', 'individual')),
  account      text not null,
  description  text not null,
  amount       numeric(16,2) not null check (amount > 0),
  vat          numeric(16,2) not null check (vat >= 0),
  wht_rate     numeric(5,2) not null check (wht_rate in (0, 1, 2, 3, 5)),
  wht_amount   numeric(16,2) not null check (wht_amount >= 0),
  paid         numeric(16,2) not null,
  method       text not null,
  reference    text not null default '',
  actor        jsonb not null
);
create index expenses_date_idx on expenses (date);

create table manual_journals (
  entry_no text primary key,
  date     date not null,
  memo     text not null,
  lines    jsonb not null,
  kind     text not null check (kind in ('manual', 'whtRemittance')),
  period   text,
  reverses text references manual_journals (entry_no),
  actor    jsonb not null
);
create index manual_journals_date_idx on manual_journals (date);

create table bank_lines (
  id               text primary key,
  date             date not null,
  description      text not null default '',
  amount           numeric(16,2) not null check (amount <> 0),
  reference        text not null default '',
  matched_entry_id text
);
-- One statement line per book entry.
create unique index bank_lines_matched_idx on bank_lines (matched_entry_id) where matched_entry_id is not null;

create table quotations (
  quote_no       text primary key,
  customer_id    text not null references customers (customer_id),
  customer_name  jsonb not null,
  date           date not null,
  valid_until    date not null,
  lines          jsonb not null,
  net_value      numeric(16,2) not null,
  status         text not null check (status in ('open', 'accepted', 'declined')),
  sales_order_no text references sales_orders (order_no),
  notes          text not null default '',
  created_by     jsonb not null
);

create table purchase_requests (
  request_no            text primary key,
  date                  date not null,
  sku                   text not null references products (sku),
  quantity              integer not null check (quantity > 0),
  reason                text not null,
  preferred_supplier_id text references suppliers (supplier_id),
  status                text not null check (status in ('pending', 'approved', 'rejected', 'ordered')),
  requested_by          jsonb not null,
  decided_by            jsonb,
  decision_note         text,
  import_order_no       text references import_orders (order_no)
);

-- Stock movements are now read a page at a time, newest first.
create index stock_movements_ts_idx on stock_movements (ts desc);
create index audit_log_type_idx on audit_log (entity_type);
