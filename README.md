# Liquor Import, Sales & Distribution System

Built from `Liquor_Import_Sales_Distribution_System_Requirements_v2.0.pdf` and
`liquor-import-fe-demo-data.xlsx`: a React web app, a Node.js API, and PostgreSQL, run together with Docker.

## Run with Docker

```bash
cp .env.example .env          # then set POSTGRES_PASSWORD and SESSION_SECRET (openssl rand -hex 32)
docker compose up -d --build
```

Open **http://localhost:8080**. On first start the API creates the database schema and loads the demo
data. Sign in as any of the nine users below with the password from `DEMO_PASSWORD` (default `demo1234`).

| User key | Role |
| --- | --- |
| `manager` | Senior Manager |
| `orderOfficer` | Order Officer |
| `docOfficer` | Documentation Officer |
| `whOfficer` | Warehouse Officer |
| `taxOfficer` | Tax Officer |
| `salesOfficer` | Sales Officer |
| `distOfficer` | Distribution Officer |
| `somchai`, `piyada` | Supervisor (two, for two-level approvals) |

Or click **Continue as guest** to look around without an account. A guest can open every page but can't
change anything, never receives prices or credit figures, and can't switch to a staff user — the server
enforces all three.

Useful commands:

```bash
docker compose logs -f api                                   # API log
docker compose exec db psql -U lisd lisd                     # SQL shell
docker compose down                                          # stop (data is kept in volumes)
docker compose down -v                                       # stop and DELETE all data + uploads
```

### Backups

The `backup` service writes a database dump and an archive of uploaded documents into `./backups` when
it starts and then every `BACKUP_EVERY_HOURS` (default 24), keeping `BACKUP_KEEP_DAYS` (default 14).
To restore a dump into a fresh, empty database:

```bash
docker compose down -v && docker compose up -d db            # empty database
gunzip -c backups/lisd-db-YYYYMMDD-HHMM.sql.gz | docker compose exec -T db psql -U lisd lisd
docker compose up -d                                         # start everything again
```

Uploaded documents: `docker compose run --rm -v "$PWD/backups:/backups" api sh -c "tar -xzf /backups/lisd-uploads-….tar.gz -C /data"`.

### Email

Invoices, credit notes, receipts, quotations, statements, reminder letters, payment vouchers and
withholding certificates have an **Email** button next to Print. The email body is the document as it
prints, with an A4 **PDF** attached (rendered on the server by a headless Chromium with Thai fonts, offline —
the document never fetches anything), and the sending is recorded on the record's history. Running the API
outside Docker without Chromium, the page is attached as `.html` instead (set `CHROMIUM_PATH` to use a
local Chrome).

Out of the box every email goes to **Mailpit**, a catch-all mailbox in the stack — read them at
<http://localhost:8025>; nothing reaches real people. To send for real, set `SMTP_HOST`, `SMTP_PORT`,
`SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` in `.env` and set `MAIL_CATCHALL_URL=` (empty).

### HTTPS on a real domain

Point the domain's DNS at the server, then in `.env` set `DOMAIN=erp.example.com` and
`SECURE_COOKIES=true`, and start with `docker compose --profile https up -d`. Caddy obtains and renews the
certificate automatically and forwards to the app.

### Settings (`.env`)

| Variable | Default | Meaning |
| --- | --- | --- |
| `POSTGRES_PASSWORD` | — | Database password. |
| `SESSION_SECRET` | — (required) | Signs login sessions; at least 32 random characters. |
| `DEMO_MODE` | `true` | Enables the header user switcher and **Reset demo data**. Set `false` for real use. |
| `ALLOW_GUEST` | follows `DEMO_MODE` | **Continue as guest** on the sign-in page: read-only, prices and credit hidden. Set `false` to require sign-in. |
| `DEMO_PASSWORD` | `demo1234` | Password given to every seeded user on first start. |
| `SECURE_COOKIES` | `false` | Set `true` when served over HTTPS. |
| `WEB_PORT` | `8080` | Port the web app is published on. |
| `API_PORT` | `3000` | Port the API is published on, for this machine only (used by `npm run dev`). |
| `BACKUP_EVERY_HOURS` / `BACKUP_KEEP_DAYS` | `24` / `14` | Backup schedule and retention. |
| `DOMAIN` | — | Domain for the optional HTTPS front end. |
| `SMTP_*`, `MAIL_CATCHALL_URL` | local Mailpit | Outgoing email (see Email above). |
| `MAIL_UI_PORT` | `8025` | Port of the Mailpit mailbox, for this machine only. |

### Users and access

**In the app:** sidebar → **Users & Access** (bottom). Senior Managers add users, change roles and names,
set temporary passwords, and disable or re-enable accounts. Supervisors see the list read-only; other
roles don't see the page (the API refuses them too). The page also shows **what each role can do** — the
same permission table the server enforces.

- New users and password resets get a **temporary password** (generated, copyable); the person must choose
  their own at their next sign-in before anything else works.
- Everyone can **change their own password** from the key icon in the header. Changing or resetting a
  password signs that account out on every other device.
- Accounts are **disabled, never deleted**, so the audit trail keeps every name. Disabling signs the person
  out at once. You can't disable yourself or change your own role, and there is always at least one active
  Senior Manager.
- Every change is recorded in the **Audit Trail** (record type "User"); passwords never are.

**From the terminal** (e.g. to create the first account, or if nobody can sign in):

```bash
npm run add-user                        # asks for username, role, Thai and English name, and password
npm run add-user -- --key nok --reset   # change an existing user's role, name or password
```

## Architecture

```
browser ──► web (nginx: built React app, proxies /api) ──► api (Node 22, Fastify) ──► db (PostgreSQL 16)
                                                              │
                                                              └─ uploads volume (attached documents)
```

- **One copy of the business rules.** Every rule lives in `src/domain/` — approvals, stock and ledger
  moves, credit/debit notes, validation, permissions — and the API runs it. The web app only displays
  data and sends commands, so nothing can be bypassed from the browser.
- **Commands.** Every write is `POST /api/commands/<name>` with `{ "args": [...] }`. The API checks the
  input shape (zod), loads the data, runs the domain action, and saves the rows that changed, all in one
  transaction that holds a database lock, so concurrent users can't oversell a lot or reuse an invoice
  number. The response carries the new state, so the screen always matches the database.
- **Server-side masking (NFR-03).** Roles without price access never receive cost prices, sales values,
  discounts, credit figures, tax amounts, or money in the audit trail — the API zeroes them before
  sending.
- **Sign-in.** Users and scrypt password hashes are in the `users` table; sessions are signed httpOnly
  cookies (12 hours).
- **Documents.** Uploaded PDFs/images (10 MB max) are stored on the `uploads` volume and served only to
  signed-in users.
- **Schema** — `server/sql/001_init.sql` onwards (`009_reminders_counts.sql` is the latest). New migrations are
  added as the next number; they run once, in order, at API start.

| Endpoint | |
| --- | --- |
| `POST /api/auth/login`, `/logout`, `GET /api/auth/me` | Sign in / out, current user |
| `POST /api/auth/guest`, `GET /api/auth/options` | Continue as guest (when allowed); what the sign-in page may offer |
| `POST /api/auth/switch` | Demo mode only: act as another user (not available to guests) |
| `GET /api/state` | All current data, masked for the caller's role — except the stock ledger and audit log (below) |
| `GET /api/audit`, `GET /api/stock-movements` | The audit log and stock ledger, filtered and a page at a time (`offset`, `limit`, filters) |
| `GET /api/stock-movements/monthly` | Units in/out per month |
| `GET /api/accounting/journal`, `/trial-balance` | The books, derived on the server (roles with price access only) |
| `POST /api/commands/:name` | Any write (56 commands — see `server/src/commands.ts`) |
| `POST /api/import-orders/:orderNo/documents` | Upload a document (multipart `kind`, `file`) |
| `GET /api/files/:id` | Download a document |
| `POST /api/admin/reset` | Demo mode only: reload the demo data |
| `POST /api/email`, `GET /api/email/status` | Email a document (roles with price access); whether email is set up |
| `GET /api/health` | Health check |

## Develop the web app with hot reload

```bash
npm install        # once
npm run dev        # http://localhost:5173
```

`npm run dev` gets everything it needs first: it creates `.env` with random secrets if there isn't one,
starts Docker Desktop if it's closed (Windows/macOS), starts the database and API in Docker (rebuilding
the API only when its code changed) and waits until they're healthy, then runs Vite. If the API is already
up it goes straight to Vite. Ctrl+C stops Vite; the containers keep running — `npm run stop` stops them.
`npm run dev:web` runs Vite alone.

The API is published on `127.0.0.1:3000` (this machine only) for this. If port 3000 is taken, set
`API_PORT` in `.env`.

## Develop without Docker

```bash
docker compose up -d db                     # or any PostgreSQL 16; expose it with the commented ports in docker-compose.yml
cd server && npm install && npm run dev     # API on :3000 (DATABASE_URL defaults to localhost:5433)
npm install && npm run dev:web              # web on :5173, proxies /api to :3000
```

## Tests

```bash
npm test                  # builds and starts the stack, then runs every suite (~10 minutes)
npm run test:api          # API only (~1 minute)
npm run test:e2e          # browser suites only
```

**CI** (`.github/workflows/ci.yml`): every push and pull request typechecks, lints and builds, then runs the
API suite against the real Docker stack; the browser suites run nightly and on demand.

**The suites reset the demo data.** The browser suites use an installed Chrome or Edge (set `CHROME_PATH`
if it's somewhere unusual); screenshots go to `tests/output/`.

- `tests/api.test.mjs` — permissions, validation, masking, concurrency, sales/import workflows, costing,
  payables, expenses and withholding, journals, month-end close, bank reconciliation, quotations, purchase
  requests, paging, and the accounting invariants (the books reconcile with stock, receivables, payables
  and tax withheld).
- `tests/e2e/workflows.mjs` — the main workflows through the real UI, in a browser.
- `tests/e2e/guest.mjs` — the read-only guest experience.
- `tests/e2e/crawl.mjs` — opens every page as five roles in both languages, at desktop and phone widths,
  and fails on console errors, missing translations, or a page that scrolls sideways.

## Modules

The sidebar is organised like an ERP: each module splits into day-to-day **transactions**, the
**master data** they run on, and read-only **reports**. Only modules a liquor importer/distributor actually
needs are included — no manufacturing, service, or payroll.

| Module | Transactions | Master data | Reports |
| --- | --- | --- | --- |
| **Sales** | Quotations · Sales Orders · Receipts & Credit Notes · AR Aging | Customers · Price Lists | |
| **Purchasing & Import** | Purchase Requests · Import Orders · Goods Receipts · Supplier Invoices & Payments | Suppliers · Licenses · Exchange Rates | |
| **Inventory** | Stock Levels (by lot) · Stock Movements · Stock Counts · Stock Alerts · Lot Trace | Products · Warehouses · Reorder Policies | |
| **Tax** | | Tax & Duty Rates · Company Profile | VAT Return (ภ.พ.30) · Withholding Tax (ภ.ง.ด.3/53) |
| **Accounting** | Expenses · Manual Journals · Bank Reconciliation · Month-end Close · Journal | | Trial Balance · Profit & Loss · Balance Sheet |

Dashboard, Approvals, Calendar, Reports, Audit Trail, and Users & Access sit across all modules. The
header bell lists what needs the signed-in person's attention (approvals and purchase requests waiting,
late deliveries and arrivals, overdue invoices, supplier bills due, expiring licenses and quotations, low
stock, withholding tax to remit, unmatched bank lines), by role.

How they connect:

- **Price Lists** set each channel's price (a % on the suggested price, or a fixed price per SKU); new
  sales orders pick it up automatically.
- **Suppliers** fill in country, Incoterms, currency, payment terms, and manufacturer registration on new
  import orders. Inactive suppliers can't be ordered from.
- **Tax & Duty Rates** drive import duty (by HS Code prefix), excise, and VAT. Each order keeps the tax
  calculated at the time, so a rate change only affects new or corrected orders.
- **Warehouses** are chosen when receiving goods; one that still holds stock can't be deactivated.
- **Stock Movements** is the stock ledger: every receipt, sale, return, and adjustment per lot. Each
  lot's movements add up to its quantity on hand, and Lot Trace checks this.
- **Stock Alerts** compares stock plus approved inbound orders against each **Reorder Policy**, and
  links straight to a pre-filled import order for the preferred supplier.
- **Lot Trace** follows a lot back to its import order, supplier, and customs declaration, and forward to
  every customer who received it, with an exportable recall list.
- **Receipts & Credit Notes** lists receipts (RC-), credit notes (CN-) and debit notes (DN-). Recording a
  payment issues a receipt; marking an order Returned or Damaged issues a credit note; changing the value
  of an already-invoiced order issues a credit or debit note against the original tax invoice rather than
  rewriting it. Each invoice keeps the VAT rate it was issued at, so a later rate change never alters it.
- **Collections** (on AR Aging): customers with overdue invoices, longest first, with the last reminder
  sent. Each has a printable/emailable **statement of account** (opening balance, every invoice, note and
  payment in the period with a running balance, closing balance = what they owe, and an aging summary) and
  **reminder letters** in three levels (friendly, firm with 7 days, final notice), each recorded on the
  customer's history. The statement is also on the customer page.
- **Credit hold:** a customer whose oldest unpaid invoice is more than 60 days past due can still order,
  but the order goes to a supervisor (the new-order screen says so before saving).
- **Stock Counts:** start a count for a warehouse (it records what every lot should hold at that moment),
  print a blind count sheet, enter what was counted, and post — every lot that differs is adjusted in one
  go, the value goes to Inventory adjustments in the books, and sales made during the count aren't
  mistaken for losses.
- **AR Aging** splits what each customer owes into Not yet due / 1–30 / 31–60 / 61–90 / 90+ days past
  due. Every invoice gets a due date from the customer's payment terms (Net N days) when it is issued;
  payments settle the oldest-due items first, so each customer's open items always add up to their
  outstanding balance. The customer page shows the same open items.
- **Company Profile** holds the seller's name, address, tax ID, and branch printed on every tax document,
  and the **opening balances**: the day the books start and the cash in the bank that day (fixed once a
  month has been closed).
- **Exchange Rates** keep baht-per-unit for each currency with history. An import order is priced in its
  supplier's currency and fixed at the rate on the day it's placed; its value is shown in both.
- **Landed cost.** Receiving a shipment gives each lot its cost per unit: supplier price at the order's
  rate + import duty + excise + a share of freight/insurance/clearing (entered at receipt). Each sale
  line records the cost of the lot it came from, so margins use what the goods actually cost. A product's
  *cost price* is its reference all-in landed cost; the expected supplier price is derived from it
  ((cost − excise) ÷ (1 + duty)), and import lines are checked against that.
- **Supplier Invoices & Payments** (accounts payable): record the supplier's invoice once goods are
  received (billed for what arrived, due on the supplier's payment days), then pay it, in part or in full,
  at the day's rate. The difference from the booked rate is an exchange gain or loss. Payables aging and
  shipments still waiting for a bill are on the same page.
- **Accounting.** Journal entries are generated from the records — invoices, credit/debit notes, receipts,
  stock movements (cost of sales, returns, adjustments), goods receipts, supplier invoices and payments,
  expenses — so the books can't disagree with the operational screens. The overview shows reconciliation
  checks live: debits = credits, inventory account = stock × landed cost, receivables = what customers
  owe, payables = unpaid supplier invoices. Opening balances (cash, receivables, stock) post to Opening
  balance equity.
- **Expenses**: rent, delivery, fees, utilities… paid from the bank, each to an expense account, with VAT
  from the payee's tax invoice (reclaimable) and **withholding tax** (1/2/3/5%) kept back. Each prints a
  **payment voucher** (ใบสำคัญจ่าย), and one with tax withheld a **withholding certificate** (50 ทวิ) for
  the payee. Supplier payments print a voucher too. The P&L now runs down to net profit after operating
  expenses.
- **Withholding Tax**: what was withheld each month, split by form (ภ.ง.ด.53 companies, ภ.ง.ด.3
  individuals), what's been remitted, and what's due by the 7th; exports the form attachments; **Remit**
  records the payment to the Revenue Department.
- **Manual Journals**: for what no record covers — accruals, owner's capital, corrections, bank charges.
  Entries must balance and can't touch the accounts the records drive (receivables, inventory, VAT,
  payables), so the reconciliation checks keep holding. A wrong entry is reversed, never edited.
- **Month-end Close**: close a month once its returns are filed; nothing (expense, journal, supplier
  invoice) can then be dated into it. Each open month shows what's still outstanding (unmatched bank
  lines, withholding not remitted, goods awaiting a bill). The latest closed month can be reopened with a
  reason.
- **Bank Reconciliation**: import the bank's statement CSV (`date, description, amount, reference`, or
  withdrawal/deposit columns; Thai Buddhist-year dates are understood). Lines already imported are
  skipped; the rest are matched automatically to book entries with the same amount within 5 days. What's
  left shows on both sides — on the statement but not in the books (record it as a journal, matched in one
  step), and in the books but not on the statement.
- **Quotations** (ใบเสนอราคา): priced like a sales order, printable, valid until a date; don't hold stock.
  Accepted, they become a sales order at the quoted prices with lots picked oldest first — the usual
  license, credit and discount checks still apply. Expired and declined ones stay on record; the win rate
  is shown.
- **Purchase Requests**: anyone in purchasing or the warehouse asks for stock (from Stock Alerts in one
  click); a supervisor other than the requester approves or rejects; purchasing opens a pre-filled import
  order from the request, which is then marked ordered.
- **VAT Return** (ภ.พ.30): output tax from the month's tax invoices, credit and debit notes; input tax from
  import VAT and expense tax invoices; the net payable or carried forward; plus the output and input tax
  reports, exportable.
- **Partial returns:** a delivered order can have some units sent back — they go back into their lot and a
  credit note is issued for exactly those units. **Payments** can be applied to a chosen invoice (otherwise
  oldest first). Units held by orders **waiting for approval** count as unavailable to other orders.
- **CSV import** on Products and Customers: download a template, fill it in Excel, preview every row with
  its problems, import the valid ones (each through the same rules as the form).
- **Audit trail** entries that mention prices, credit, discounts, or payments are hidden from roles without
  price access, the same rule as on-screen masking.

## What's here

- **Views that fit the data** — tables stay the default where people compare and filter (Customers,
  with a credit-usage bar in the table; Audit Trail). Sales and Import Orders also have a **board** by
  stage (finished orders: last 30 days only; the rest stay in the table) and a **calendar** of what's
  ahead: planned deliveries and invoices still owed, or ETAs. Licenses default to a **validity timeline**
  with Renew on each row. The **Calendar** page shows arrivals, deliveries, payments due and license
  expiries; colour means the kind of event, a red outline means late, struck through means done, and each
  kind keeps its own "late" and "coming up" counts. The Dashboard shows recent activity as a feed.
- **Order progress** — sales orders show Ordered → (Approved) → Out for delivery → Delivered → Paid;
  import orders Raised → Approved → Customs cleared → Received. Each step has the time and person, the
  Delivered step shows the planned delivery date and Received the ETA (red when missed), and the Paid step
  comes from receivables (shown only with price access). Status changes and rescheduling are on the same
  card. Orders keep a real status history, and each sales order has a planned delivery date that dispatch
  can reschedule (up to 90 days ahead).
- **Dashboard** — KPIs, a real-time status list of every order, and exception lists (expiring licenses,
  aging stock, overdue or blocked import orders, at-risk customers, orders ready to pick).
- **Master data** — Products, Licenses, Customers, Inventory. Searchable tables, edit drawer, CSV export.
- **Detail pages** for Import Orders, Sales Orders, and Customers, each with its own audit history.
- **Import Orders** — new order form with 4 intake methods (API/Excel/Email are simulated, manual is real),
  auto-calculated tax/duty/VAT, license checks, and a full workflow:
  Staging → Approved (two different supervisors over ฿500k) → Customs Cleared (declaration no.) →
  Received into a chosen warehouse. Line items can be corrected while in Staging, flagged, or Rejected —
  correcting a rejected order resubmits it.
- **Sales Orders** — multi-line: each line is a product, lot, quantity, price, and discount (two lines may
  draw on the same lot; together they can't exceed it). License, credit limit, stock, and margin are
  checked live as you build the order, and each line suggests the oldest lot with stock left (FIFO). Orders over the standard discount, over the credit limit, or priced
  below cost go to the Supervisor approval queue — nothing is booked or invoiced until approved.
- **Tax documents** — full Thai tax invoice (ใบกำกับภาษี, Revenue Code s.86/4): seller and buyer name,
  address, 13-digit tax ID and head office/branch, invoice number and date, every line, VAT shown
  separately, amount in words in Thai and English, original/copy. Delivery note and picking list (grouped
  by warehouse) per order. Receipts, credit notes (ใบลดหนี้) and debit notes (ใบเพิ่มหนี้) print from
  Receipts & Credit Notes; notes state the original invoice, original and correct value, VAT on the
  difference, and the reason. Customer and company tax IDs are checked with the mod-11 check digit.
- **Delivery** — status only moves forward (Pending → In Delivery → Delivered, or Returned/Damaged).
  Returned restocks the lot and Returned/Damaged credit the customer back; both ask for confirmation.
- **Accounts receivable** — record customer payments on the customer page. The outstanding balance only
  moves through orders, returns, and payments; it can't be typed in.
- **Approvals** — one queue for both Import and Sales Orders, with reject-with-reason and full name +
  timestamp on every decision. Nobody can approve an order they raised themselves.
- **Audit Trail** — every create/update/approve/reject/payment, attributed to the signed-in user and
  recording old → new values. Searchable by record, user, or text; read from the server a page at a time;
  CSV export of everything that matches.
- **Reports** — net sales and gross margin, Sales by SKU/Channel/Customer, Inventory Value by pipeline
  stage and by aging, plus a monthly tax & sales reconciliation. CSV export and print-to-PDF.
- **Role switcher** in the header, covering all roles in the spec. Price/Credit/Discount are masked for
  roles that shouldn't see them, and each action is limited to the roles that do that job (see below).
- **Thai/English toggle**, all content bilingual.

Everything is stored in PostgreSQL. In demo mode, **Reset demo data** in the sidebar reloads the original
demo dataset. Its dates move with the calendar — license expiries, recent orders, the last three months
of expenses and last month's bank statement — so a reset always shows the same situation (two licenses
about to expire, a customer on credit hold, withholding due, a statement to reconcile) whenever it's run.

## Business rules

All writes go through `DataContext`, which checks the rule again even when the screen already
prevented it, and returns a reason (shown as a red toast) instead of quietly doing the wrong thing:

| Rule | Where it's enforced |
| --- | --- |
| Role permissions per action (`ROLE_PERMISSIONS` in `src/data/identities.ts`) | every action |
| Raiser can't approve their own order; high-value imports need two *different* supervisors | approvals |
| Approval re-checks stock and licenses at approval time, not just at entry | approvals |
| Import validation (SKU, ABV, price, quantity, **and** license expiry/ETA/Type 5 cap) runs on create, on every correction, and on ETA change | import orders |
| Over-discount / over-credit / below-cost sales need a supervisor, including when editing a booked order | sales orders |
| Booked orders can be edited only until they ship; stock and balance move by the difference, line by line | sales orders |
| Tax ID must be 13 digits with a valid check digit; branch 5 digits; address in Thai and English | customers, company |
| Payment terms 0–365 days; due date = invoice date + terms | customers, sales orders |
| Delivery status follows the lifecycle above; Returned/Damaged are final | sales orders |
| Product stock changes only through receipts, sales, returns, and reasoned stock adjustments | inventory |
| Renewing a license updates every customer holding it | licenses |
| Lot numbers are unique; receipts total quantities per SKU across lines | receiving |
| Units held by orders awaiting approval can't be promised to another order | sales orders |
| An import order needs an exchange rate for its currency; it keeps the rate it was placed at | import orders |
| One supplier invoice per received shipment; payments can't exceed what's owed | payables |
| Five wrong passwords lock an account for 15 minutes (a Senior Manager can unlock it) | sign-in |
| Nothing is dated into a closed month; months close in order and only the latest reopens, with a reason | accounting |
| Journals balance and never touch receivables, inventory, VAT or payables; reversals, not edits | accounting |
| Withholding needs the payee's valid tax ID; a month's tax is remitted once, after the month ends | expenses, tax |
| A statement line matches one book entry of the same amount; re-imported lines are skipped | bank |
| A quotation converts once, before it expires, only with enough free stock | quotations |
| Orders for a customer with invoices over 60 days overdue need approval (credit hold) | sales orders |
| One open count per warehouse; a count posts only when every lot is counted; differences are against the start of the count | stock counts |
| One open purchase request per product; the requester can't approve it; only approved requests are ordered | purchase requests |

Who can do what:

| Role | Can do |
| --- | --- |
| Senior Manager | product prices, customer credit terms, open customers, price lists, company profile, exchange rates, supplier invoices & payments, expenses, journals, bank reconciliation, month-end close, users |
| Order Officer | create/edit import orders, attach documents, products, suppliers, reorder policies, purchase requests |
| Documentation Officer | attach documents, record customs clearance, add/renew licenses |
| Warehouse Officer | receive goods, adjust stock, stock counts, update delivery status, warehouses, reorder policies, purchase requests |
| Tax Officer | record customs clearance, tax & duty rates, exchange rates, expenses & withholding tax |
| Sales Officer | quotations, create/edit sales orders, record payments, statements and payment reminders, open customers (credit terms start at 0) |
| Distribution Officer | update delivery status |
| Supervisor | everything above except managing users (they can view them) and closing months, plus approve/reject orders and purchase requests |

## Known limitations

- The tax formula is illustrative, not the real Excise/Customs tariff schedule.
- There's no payroll or fixed-asset register: salaries and depreciation are entered as expenses or
  journals. Withholding forms are produced as printable certificates and spreadsheet attachments, not
  the Revenue Department's e-filing format. Bank statements are imported from CSV (no direct bank feed).
- Thai e-Tax Invoice (XML) and e-Withholding files aren't produced; documents are printed or emailed as PDF.
- The audit log and stock ledger — the records that grow without bound — are read a page at a time; the
  rest of the data still comes in one `GET /api/state`, and each command reloads the data it works on.
  That is simple and fast at this business's scale; a very large customer or order history would need the
  same paging for those screens too.
- Writes are serialised by one database lock — correct and simple, but one write at a time.

## Data fidelity notes

The 8 original orders in the spreadsheet only had aggregate totals (SKU count, total value), not
line-item detail. Line items were reconstructed to match each order's original total at cost price.
Because the spreadsheet's cost price only makes sense as an all-in landed cost (with duty on top, sales
would run at a loss), each line's supplier price is the matching share of the product's expected supplier
price, in the supplier's currency at the rate on the order date; an order's value is that goods value in
baht. The two original import licenses (both expired) were kept as-is rather than adding a fake
valid one.

The spreadsheet gives each customer's outstanding balance but only a few of the invoices behind it. The
rest is carried as "legacy invoice brought forward" documents (OB-…), dated relative to when the demo
data is reset so the aging report always shows a realistic mix. A database created before this existed
keeps its data; any balance its documents don't explain shows as one "brought forward" open item.

**Stock reconciliation.** The source Products sheet's stock figures hadn't deducted the sales already
taken from each lot (each SKU's figure was exactly *lots + units sold*), and two SKUs (Casa Roble Reposado,
Riverside Craft Lager — 860 units) had stock but no lot at all. Product stock is now derived from the
lots, which are what can actually be picked and traced, and those two SKUs carry an opening-balance lot
(`LOT-OPEN-…`, received date assumed as 2026-05-01) so their stock is sellable and traceable.

**Dashboard KPIs** are computed live wherever the data allows, so the Dashboard never contradicts the
module pages: planned import lead time (order date → ETA, since actual arrival dates aren't recorded),
share of import orders flagged at intake, inventory value (stock at cost + approved orders in transit —
unapproved purchase orders aren't inventory), licenses expired or expiring within 30 days, tax & duty
(excluding rejected orders), net sales over the last 90 days, annualised turnover, SKUs with stock older
than 180 days, and outstanding customer credit. On-time delivery can't be computed (orders carry no
promised delivery date), so it shows the source sheet's figure, labelled **Sample figure**.

The new master data comes from what the spreadsheet already implied wherever possible. Suppliers come
from the suppliers named on the original import orders, Tax & Duty Rates and Price Lists from the rates
the app used before, and warehouse names from the original lookup. Some values are new and illustrative:
warehouse addresses and capacities, reorder points and quantities, and supplier contact emails (on the
`.example` domain). The opening stock ledger is rebuilt from the seed lots and seed sales so that every
lot's movements add up to its current quantity. Lots that predate the system show "Opening balance" as
their source.

`deliveryNoteNo` on Sales Orders has no source in the spreadsheet (it only had a tax invoice number) — a
delivery note number was generated so the print view has something to show. Product Label history has no
source at all in the spreadsheet; it's invented data seeded for 4 of the 12 SKUs.
