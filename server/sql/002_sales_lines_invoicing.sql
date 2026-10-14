-- Multi-line sales orders, invoice & due dates, customer legal details and payment terms,
-- the company profile (seller on tax invoices), and opening balances on AR documents.
-- Existing data is converted, not discarded: each existing order becomes a one-line order.

create table sales_order_lines (
  order_no         text not null references sales_orders (order_no) on delete cascade,
  line_no          integer not null,
  sku              text not null references products (sku),
  lot_batch        text not null references inventory_lots (lot_batch),
  quantity         integer not null check (quantity > 0),
  unit_price       numeric(14,2) not null,
  discount_percent numeric(5,2) not null,
  net_value        numeric(16,2) not null,
  primary key (order_no, line_no)
);
create index sales_order_lines_lot_idx on sales_order_lines (lot_batch);
create index sales_order_lines_sku_idx on sales_order_lines (sku);

insert into sales_order_lines (order_no, line_no, sku, lot_batch, quantity, unit_price, discount_percent, net_value)
select order_no, 1, sku, lot_batch, quantity, unit_price, discount_percent, net_value from sales_orders;

alter table customers
  add column tax_id           text not null default '',
  add column branch           text not null default '00000',
  add column address          jsonb not null default '{"th": "", "en": ""}',
  add column credit_term_days integer not null default 30 check (credit_term_days between 0 and 365);

alter table sales_orders
  add column invoice_date date,
  add column due_date     date;
update sales_orders set invoice_date = order_date where tax_invoice_no <> '—';
update sales_orders s set due_date = s.invoice_date + c.credit_term_days
  from customers c where c.customer_id = s.customer_id and s.invoice_date is not null;

alter table sales_orders
  drop column sku,
  drop column quantity,
  drop column unit_price,
  drop column discount_percent,
  drop column lot_batch;

create table company (
  id      integer primary key check (id = 1),
  name    jsonb not null,
  tax_id  text not null,
  branch  text not null,
  address jsonb not null,
  phone   text not null default '',
  email   text not null default ''
);

alter table ar_documents
  add column due_date       date,
  add column reason         jsonb,
  add column original_value numeric(16,2);
alter table ar_documents drop constraint ar_documents_type_check;
alter table ar_documents add constraint ar_documents_type_check
  check (type in ('payment', 'creditNote', 'debitNote', 'openingBalance'));
