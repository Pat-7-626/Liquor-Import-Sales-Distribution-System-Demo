-- How customers pay us (printed on invoices, statements and reminders), and the company's logo,
-- authorised signature and stamp (small images, stored as data URLs so documents render offline).
alter table company
  add column bank_name         text not null default '',
  add column bank_branch       text not null default '',
  add column bank_account_name text not null default '',
  add column bank_account_no   text not null default '',
  add column promptpay_id      text not null default '',
  add column logo              text not null default '',
  add column signature         text not null default '',
  add column stamp             text not null default '',
  add column print_signature   boolean not null default false;
