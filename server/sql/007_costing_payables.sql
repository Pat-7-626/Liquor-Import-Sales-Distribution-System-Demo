-- Currencies and landed cost; supplier invoices and payments; issued-invoice snapshots; payments against a
-- chosen invoice; partial returns. Existing rows get values that describe them as they were entered.

create table exchange_rates (
  currency       text not null check (currency ~ '^[A-Z]{3}$'),
  effective_date date not null,
  rate           numeric(16,6) not null check (rate > 0),
  primary key (currency, effective_date)
);

-- Import orders: line prices are in the order's currency, valued in baht at the order's rate. Orders that
-- already exist were entered with baht prices, so they are baht orders at rate 1.
alter table import_orders
  add column currency      text not null default 'THB',
  add column exchange_rate numeric(16,6) not null default 1;

-- Each lot's landed cost per unit; existing lots are carried at their product's cost price.
alter table inventory_lots add column unit_cost numeric(14,2);
update inventory_lots l set unit_cost = p.cost_price from products p where p.sku = l.sku;

-- Sales lines remember what their lot cost when sold, and how many units came back.
alter table sales_order_lines
  add column unit_cost         numeric(14,2),
  add column returned_quantity integer not null default 0 check (returned_quantity >= 0);
update sales_order_lines s set unit_cost = l.unit_cost from inventory_lots l where l.lot_batch = s.lot_batch;

-- The tax invoice as issued (lines, value, VAT rate). Existing booked orders: their current lines.
alter table sales_orders add column invoice jsonb;
update sales_orders o set invoice = jsonb_build_object(
    'netValue', o.net_value,
    'vatPercent', coalesce(o.vat_percent, 7),
    'lines', (select coalesce(jsonb_agg(jsonb_build_object(
        'sku', l.sku, 'lotBatch', l.lot_batch, 'quantity', l.quantity, 'unitPrice', l.unit_price,
        'discountPercent', l.discount_percent, 'netValue', l.net_value, 'unitCost', l.unit_cost) order by l.line_no), '[]'::jsonb)
      from sales_order_lines l where l.order_no = o.order_no))
  where o.approval_status is null and o.invoice_date is not null;

alter table ar_documents add column applies_to text;

-- Supplier payment terms in days, read from the existing text where it says ("T/T 30 days" → 30).
alter table suppliers add column payment_term_days integer not null default 0 check (payment_term_days between 0 and 365);
update suppliers set payment_term_days = coalesce(substring(payment_terms from '(\d+)\s*day')::int, 0);

create table ap_documents (
  doc_no          text primary key,
  type            text not null check (type in ('invoice', 'payment')),
  supplier_id     text not null references suppliers (supplier_id),
  import_order_no text not null references import_orders (order_no),
  reference       text not null default '',
  date            date not null,
  due_date        date,
  currency        text not null,
  amount          numeric(16,2) not null check (amount > 0),
  rate            numeric(16,6) not null check (rate > 0),
  amount_thb      numeric(16,2) not null,
  applies_to      text references ap_documents (doc_no),
  method          text,
  actor           jsonb not null
);
create index ap_documents_supplier_idx on ap_documents (supplier_id);
