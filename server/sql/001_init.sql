-- Liquor Import, Sales & Distribution System — initial schema.
-- Bilingual labels (th/en) and small nested records are jsonb; everything that is queried, joined,
-- or constrained is a real column. Derived values (license status, credit status) are not stored.

create table users (
  key           text primary key,
  role          text not null,
  name          jsonb not null,
  password_hash text not null
);

create table suppliers (
  supplier_id        text primary key,
  name               text not null unique,
  country            text not null,
  manufacturer_reg_no text not null default '',
  origin             text not null default '',
  default_incoterms  text not null,
  currency           text not null,
  payment_terms      text not null,
  contact_email      text not null default '',
  active             boolean not null default true
);

create table warehouses (
  code     text primary key,
  name     jsonb not null,
  address  text not null default '',
  capacity integer not null check (capacity > 0),
  bonded   boolean not null default false,
  active   boolean not null default true
);

create table licenses (
  license_no  text primary key,
  type        jsonb not null,
  holder      jsonb not null,
  category    text not null check (category in ('import', 'sales')),
  issue_date  date not null,
  expiry_date date not null check (expiry_date > issue_date)
);

create table products (
  sku             text primary key,
  name            text not null,
  category        text not null,
  abv             numeric(5,2) not null check (abv between 0 and 75),
  package_size    integer not null check (package_size > 0),
  unit            text not null,
  cost_price      numeric(14,2) not null check (cost_price > 0),
  suggested_price numeric(14,2) not null check (suggested_price > 0),
  stock_available integer not null check (stock_available >= 0),
  status          text not null,
  hs_code         text not null
);

create table customers (
  customer_id        text primary key,
  name               jsonb not null,
  channel_type       text not null,
  license_no         text references licenses (license_no),
  license_expiry     date,
  credit_limit       numeric(14,2) not null check (credit_limit >= 0),
  outstanding_balance numeric(14,2) not null,
  standard_discount  numeric(5,2) not null check (standard_discount between 0 and 100)
);

create table price_lists (
  channel            text primary key,
  adjustment_percent numeric(6,2) not null
);

create table price_list_overrides (
  channel text not null references price_lists (channel) on delete cascade,
  sku     text not null references products (sku),
  price   numeric(14,2) not null check (price > 0),
  primary key (channel, sku)
);

create table tax_settings (
  id                       integer primary key check (id = 1),
  vat_percent              numeric(6,2) not null,
  excise_thb_per_abv_liter numeric(10,2) not null,
  default_duty_percent     numeric(6,2) not null
);

create table duty_rates (
  hs_prefix    text primary key,
  label        text not null,
  duty_percent numeric(6,2) not null,
  sort_order   integer not null
);

create table reorder_policies (
  sku                   text primary key references products (sku),
  reorder_point         integer not null check (reorder_point >= 0),
  reorder_qty           integer not null check (reorder_qty > 0),
  preferred_supplier_id text references suppliers (supplier_id)
);

create table import_orders (
  order_no               text primary key,
  supplier_id            text references suppliers (supplier_id),
  supplier               text not null,
  country                text not null,
  incoterms              text not null,
  order_date             date not null,
  eta_date               date not null,
  sku_count              integer not null,
  total_value            numeric(16,2) not null,
  status                 text not null,
  approver               jsonb,
  first_approver         jsonb,
  created_by             jsonb,
  customs_declaration_no text unique,
  import_license_no      text references licenses (license_no),
  note                   jsonb,
  logistics              jsonb,
  tax                    jsonb,
  receiving              jsonb
);
create index import_orders_status_idx on import_orders (status);

-- Line SKUs are deliberately not a foreign key: intake keeps a line that fails Product Master
-- validation so it can be corrected (FR-04/05).
create table import_order_lines (
  order_no   text not null references import_orders (order_no) on delete cascade,
  line_no    integer not null,
  sku        text not null,
  abv        numeric(5,2) not null,
  qty        integer not null,
  unit_price numeric(14,2) not null,
  primary key (order_no, line_no)
);

create table files (
  id          uuid primary key,
  name        text not null,
  mime        text not null,
  size        integer not null,
  path        text not null,
  uploaded_by text not null,
  uploaded_at timestamptz not null default now()
);

create table import_order_documents (
  id          text primary key,
  order_no    text not null references import_orders (order_no) on delete cascade,
  name        text not null,
  kind        text not null,
  url         text not null,
  uploaded_at timestamptz not null,
  sort_order  integer not null
);

create table inventory_lots (
  lot_batch          text primary key,
  sku                text not null references products (sku),
  product_name       text not null,
  received_date      date not null,
  quantity_remaining integer not null check (quantity_remaining >= 0),
  warehouse          text not null references warehouses (code),
  excise_stamp_date  date
);
create index inventory_lots_sku_idx on inventory_lots (sku);

create table sales_orders (
  order_no         text primary key,
  customer_id      text not null references customers (customer_id),
  customer_name    jsonb not null,
  order_date       date not null,
  channel_type     text,
  sku              text not null references products (sku),
  quantity         integer not null check (quantity > 0),
  unit_price       numeric(14,2) not null,
  discount_percent numeric(5,2) not null,
  net_value        numeric(16,2) not null,
  lot_batch        text not null references inventory_lots (lot_batch),
  delivery_status  text not null,
  tax_invoice_no   text not null,
  delivery_note_no text not null,
  vat_percent      numeric(6,2),
  approver         jsonb,
  approval_status  text,
  approval_note    jsonb,
  approval_reason  jsonb,
  created_by       jsonb
);
-- "—" marks an order still awaiting approval; every issued number must be unique.
create unique index sales_orders_invoice_uq on sales_orders (tax_invoice_no) where tax_invoice_no <> '—';
create unique index sales_orders_dn_uq on sales_orders (delivery_note_no) where delivery_note_no <> '—';
create index sales_orders_customer_idx on sales_orders (customer_id);

create table stock_movements (
  id        text primary key,
  ts        timestamptz not null,
  type      text not null check (type in ('receipt', 'sale', 'return', 'adjustment')),
  sku       text not null,
  lot_batch text not null references inventory_lots (lot_batch),
  warehouse text not null,
  quantity  integer not null,
  reference text not null,
  actor     jsonb not null
);
create index stock_movements_lot_idx on stock_movements (lot_batch);

create table ar_documents (
  doc_no      text primary key,
  type        text not null check (type in ('payment', 'creditNote', 'debitNote')),
  customer_id text not null references customers (customer_id),
  date        date not null,
  amount      numeric(16,2) not null check (amount > 0),
  method      text,
  reference   text not null,
  actor       jsonb not null
);

create table audit_log (
  id          text primary key,
  ts          timestamptz not null,
  entity_type text not null,
  entity_id   text not null,
  action      text not null,
  actor       jsonb not null,
  summary     jsonb not null,
  sensitive   boolean not null default false
);
create index audit_log_entity_idx on audit_log (entity_id);
create index audit_log_ts_idx on audit_log (ts desc);
