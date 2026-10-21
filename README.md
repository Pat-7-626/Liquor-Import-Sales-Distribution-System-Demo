# Liquor Import, Sales & Distribution System

A complete, bilingual (Thai / English) ERP demo for a company that imports wine, spirits and beer into
Thailand and sells them to hotels, restaurants and shops. It covers the whole flow: import orders and
customs, lots and warehouses, sales orders and delivery, Thai tax documents, receivables and payables,
and a general ledger that is always in step with the operational screens.

It was built from a written requirements specification (v2.0) and a demo-data spreadsheet; neither source
file is part of this repository. It runs as a React web app, a Node.js API and a PostgreSQL database,
started together with Docker.

**Highlights**

- **One set of business rules**, run by the server: approvals, credit, licenses, stock, tax and accounting
  can't be bypassed from the browser.
- **Prices hidden by role**, on the server: roles without price access never receive cost prices, sales
  values, credit figures or money amounts at all.
- **Thai tax documents**: tax invoices, receipts, credit/debit notes, withholding certificates (50 ทวิ),
  VAT return (ภ.พ.30) and withholding returns (ภ.ง.ด.3/53), printed or emailed as PDF.
- **Books derived from the records**: the journal, trial balance, P&L and balance sheet come straight from
  invoices, payments, stock movements and expenses, with live reconciliation checks.
- **Lot traceability**: every unit can be followed from the supplier's shipment to the customer who got
  it, with QR lot labels you can scan with a phone or laptop camera.
- **Security**: hashed passwords, account lockout, optional or required two-step sign-in, a full audit
  trail, a content security policy, and an optional HTTPS front end.
- **Tested**: about 570 automated checks across the API and a real browser, plus a crawl of every page for
  five roles in both languages at desktop and phone widths.

---

## Contents

- [Quick start](#quick-start)
- [A five-minute tour](#a-five-minute-tour)
- [What it does](#what-it-does)
- [Printed documents and exports](#printed-documents-and-exports)
- [Roles and permissions](#roles-and-permissions)
- [Business rules](#business-rules)
- [Running it](#running-it)
- [Users, passwords and two-step sign-in](#users-passwords-and-two-step-sign-in)
- [Architecture](#architecture)
- [Development](#development)
- [Tests](#tests)
- [About the demo data](#about-the-demo-data)
- [Known limitations](#known-limitations)

---

## Quick start

You need **Docker Desktop** (or Docker Engine with Compose).

```bash
cp .env.example .env          # then set POSTGRES_PASSWORD and SESSION_SECRET (e.g. openssl rand -hex 32)
docker compose up -d --build
```

Open **<http://localhost:8080>**. On first start the API creates the database and loads the demo data.

Pick a user on the sign-in page; every demo user's password is the `DEMO_PASSWORD` from `.env`
(default **`demo1234`**).

| User | Role | Good for trying |
| --- | --- | --- |
| `manager` | Senior Manager | prices and credit terms, the books, closing a month, users |
| `orderOfficer` | Order Officer | import orders, suppliers, purchase requests |
| `docOfficer` | Documentation Officer | import documents, customs clearance, licenses |
| `whOfficer` | Warehouse Officer | receiving goods, stock adjustments and counts, delivery |
| `taxOfficer` | Tax Officer | tax rates, expenses, withholding tax |
| `salesOfficer` | Sales Officer | quotations, sales orders, payments, reminders |
| `distOfficer` | Distribution Officer | delivery status only |
| `somchai`, `piyada` | Supervisor | approvals (two of them, for two-level approval) and almost everything else |

Or click **Continue as guest** to look around without an account: a guest can open every page but can't
change anything and never receives prices or credit figures. The server enforces both.

In demo mode the header has a **user switcher** to jump between roles, and **Reset demo data** at the
bottom of the sidebar reloads the original data. The demo's dates move with the calendar, so a reset always
shows the same situation: two licenses about to expire, a customer on credit hold, withholding tax due and
a bank statement to reconcile.

Emails the app sends never reach real people: they land in a local test mailbox at
**<http://localhost:8025>**.

| Command | Does |
| --- | --- |
| `docker compose logs -f api` | follow the API log |
| `docker compose exec db psql -U lisd lisd` | SQL shell |
| `docker compose stop` / `npm run stop` | stop (data is kept) |
| `docker compose down -v` | stop and **delete** all data and uploaded documents |

---

## A five-minute tour

1. **Dashboard** (as `somchai`): KPIs, every open order's status, and what needs attention. The **bell**
   in the header lists what is waiting on you.
2. **Search**: press **Ctrl K** (or **/**) and type an order number, a customer or a lot. **?** lists
   the keyboard shortcuts; **N** starts a new record on a list page.
3. **Sales → Sales Orders → New**: pick a customer and products. License, credit limit, stock and margin
   are checked as you type, and each line suggests the oldest lot (FIFO). Too much discount, over the credit
   limit or below cost? It goes to **Approvals** instead of being booked.
4. Open an order and print its **tax invoice**, delivery note or picking list, or **Email** it as a PDF
   (then look in <http://localhost:8025>). **Copy order** starts a repeat order for the same customer.
5. **Purchasing & Import → Import Orders**: an order moves through Staging → Approved → Customs cleared →
   Received into a warehouse. Receiving creates lots with their landed cost and prints **QR lot labels**.
6. **Inventory → Lot Trace**: follow a lot back to its shipment and forward to every customer who
   received it, with an exportable recall list.
7. **Accounting** (as `manager`): the overview shows the reconciliation checks live; **Trial Balance**,
   **Profit & Loss** and **Balance Sheet** come straight from the records.
8. **My account** (key icon in the header): turn on **two-step sign-in** with an authenticator app, or
   the **morning summary email**.
9. Switch to `whOfficer` or continue as a guest: the same pages, with prices and credit masked.

---

## What it does

The sidebar is organised like an ERP. Each module has an **Overview** and splits into day-to-day
**transactions**, the **master data** they run on, and **reports**. Only what a liquor importer and
distributor needs is included: no manufacturing, service or payroll.

| Module | Transactions | Master data | Reports |
| --- | --- | --- | --- |
| **Sales** | Quotations · Sales Orders · Receipts & Credit Notes · AR Aging | Customers · Price Lists | |
| **Purchasing & Import** | Purchase Requests · Import Orders · Goods Receipts · Supplier Invoices & Payments | Suppliers · Licenses · Exchange Rates | |
| **Inventory** | Stock Levels · Stock Movements · Stock Counts · Stock Alerts · Lot Trace | Products / SKU · Warehouses · Reorder Policies | |
| **Tax** | | Tax & Duty Rates · Company Profile | VAT Return (ภ.พ.30) · Withholding Tax (ภ.ง.ด.3/53) |
| **Accounting** | Expenses · Manual Journals · Bank Reconciliation · Month-end Close · Opening Balances · Journal | | Trial Balance · Profit & Loss · Balance Sheet |

**Dashboard**, **Approvals**, **Calendar**, **Reports**, **Audit Trail** and **Users & Access** sit across
all modules.

### Sales

- **Quotations** (ใบเสนอราคา) are priced like a sales order, printable, and valid until a date. They don't
  hold stock. When accepted, a quotation becomes a sales order at the quoted prices, with lots picked oldest
  first and the usual license, credit and discount checks. Expired and declined quotations stay on record,
  and the win rate is shown.
- **Sales Orders** have several lines, each a product, lot, quantity, price and discount. Two lines may
  draw on the same lot, but together they can't exceed it. Price Lists set each channel's price
  automatically.
  - **Approval:** orders over the standard discount, over the credit limit or priced below cost wait for a
    supervisor, and nothing is booked or invoiced until they're approved.
  - **Booked stock:** units held by orders awaiting approval aren't offered to other orders.
  - **Editing:** a booked order can be edited until it ships; stock and balance move by the difference.
  - **Delivery:** each order has a planned delivery date (dispatch can reschedule it up to 90 days ahead).
    Its progress shows Ordered → (Approved) → Out for delivery → Delivered → Paid, with who did each step
    and when.
  - **Views:** the list has a **board** by stage and a **calendar** of planned deliveries and payments
    owed.
- **Delivery status** only moves forward: Pending → In Delivery → Delivered, or Returned / Damaged.
  Returned stock goes back into its lot, and both Returned and Damaged credit the customer. A delivered order
  can also have **some units returned**, which issues a credit note for exactly those units.
- **Receipts & Credit Notes** lists receipts (RC-), credit notes (CN-) and debit notes (DN-).
  - **Receipts:** recording a payment issues a receipt. A payment can be applied to a chosen invoice;
    otherwise it settles the oldest first.
  - **Notes:** changing the value of an order that's already invoiced issues a credit or debit note against
    the original tax invoice, instead of rewriting it.
  - **VAT:** each invoice keeps the VAT rate it was issued at.
- **AR Aging** splits what each customer owes into Not yet due / 1–30 / 31–60 / 61–90 / 90+ days. Every
  invoice gets a due date from the customer's payment terms. Its **Collections** tab lists customers with
  overdue invoices, longest first, with:
  - a printable, emailable **statement of account**: opening balance, every invoice, note and payment with
    a running balance, closing balance and aging summary;
  - **reminder letters** in three levels (friendly, firm with 7 days, final notice), each recorded on the
    customer's history.
- **Credit hold:** a customer whose oldest unpaid invoice is more than 60 days past due can still order, but
  the order goes to a supervisor. The order screen says so before saving.
- **Customers** hold the tax ID (checked with the mod-11 check digit), branch, Thai and English address,
  credit limit, payment terms and license. The customer page shows open items, payments, the statement and
  the full history. The outstanding balance moves only through orders, returns and payments; nobody can
  type it in.

### Purchasing and import

- **Purchase Requests:** purchasing or warehouse staff ask for stock, from Stock Alerts in one click. A
  supervisor other than the requester approves or rejects, in the Approvals queue. Purchasing then opens an
  import order pre-filled from the request.
- **Import Orders** have four intake methods: manual, plus API, Excel and email, which are simulated.
  - **Calculation:** duty, excise and VAT are calculated automatically, and licenses are checked (expiry,
    ETA, Type 5 cap).
  - **Workflow:** Staging → Approved → Customs cleared (with the declaration number) → Received into a
    chosen warehouse. Orders over ฿500,000 need **two different supervisors**.
  - **Corrections:** lines can be corrected in Staging, flagged or rejected, and correcting a rejected
    order resubmits it.
  - **Documents:** supplier invoice, packing list, bill of lading and import license (PDF or image) are
    attached to the order.
- **Landed cost:** receiving a shipment gives each lot its cost per unit. That is the supplier price at the
  order's exchange rate, plus import duty, excise, and a share of freight, insurance and clearing (entered at
  receipt). Each sale line records the cost of the lot it came from, so margins use what the goods really
  cost.
- **Supplier Invoices & Payments** (accounts payable):
  - **Invoices:** recorded once goods are received, billed for what arrived, and due on the supplier's
    payment terms.
  - **Payments:** in part or in full, at the day's rate; the difference from the booked rate is booked as
    an exchange gain or loss.
  - **Overview:** payables aging and shipments still waiting for a bill are on the same page.
- **Exchange Rates** keep the baht rate for each currency, with history. An import order is priced in the
  supplier's currency and fixed at the rate of the day it's placed.
- **Suppliers** fill in country, Incoterms, currency, payment terms and manufacturer registration on new
  orders. **Licenses** have a validity timeline with Renew on each row; renewing updates every customer
  holding the license.

### Inventory

- **Stock Levels** by lot, with age and warehouse, and a **QR label** for any lot. Product stock is
  always the sum of its lots.
- **Stock Movements** is the stock ledger: every receipt, sale, return and adjustment, per lot. Each
  lot's movements add up to its quantity on hand, and Lot Trace checks this.
- **Stock Counts:** start a count for a warehouse, which records what every lot should hold at that moment.
  Print a blind count sheet, enter or scan what was counted, then post. Every lot that differs is adjusted
  in one go and the value goes to inventory adjustments in the books. Sales made during the count aren't
  mistaken for losses.
- **Stock Alerts** compares stock plus approved inbound orders against each **Reorder Policy**, and opens
  a pre-filled import order or purchase request.
- **Lot Trace** follows a lot back to its import order, supplier and customs declaration, and forward to
  every customer who received it, with an exportable recall list.
- **Warehouses** are chosen when receiving. One that still holds stock can't be deactivated.

### Tax

- **Tax & Duty Rates** drive the import taxes, worked out the way Customs and the Excise Department do:
  1. **Import duty** on the goods value, by HS Code. Wine has been duty-free since 23 February 2024;
     spirits and beer default to 60% (MFN). FTA origins may pay less.
  2. **Excise** (Excise Act B.E. 2560) has two parts: a share of the suggested retail price before VAT, plus
     baht per litre of pure alcohol. Defaults: spirits 20% + ฿255 and beer 22% + ฿430 (2017 tariff), and
     wine 5% + ฿1,000 (cut on 23 February 2024).
  3. **Collected with the excise:** the Interior Ministry tax (10% of the excise) and the fund levies
     (ThaiHealth 2%, Thai PBS 1.5%, sports 2%, elderly 2%).
  4. **Import VAT** is charged on goods + duty + excise + those levies, and is reclaimable.

  One excise stamp is needed per bottle or can; a 6-pack counts six. Each order keeps the tax calculated at
  the time, so a rate change affects only new or corrected orders.
- **VAT Return (ภ.พ.30):** output tax from the month's tax invoices, credit notes and debit notes, input tax
  from import VAT and expense tax invoices, and the net amount payable or carried forward. The output and
  input tax reports can be exported.
- **Withholding Tax:** what was withheld each month, split by form (ภ.ง.ด.53 for companies, ภ.ง.ด.3 for
  individuals), what has been remitted, and what is due by the 7th. It exports the form attachments, and
  **Remit** records the payment to the Revenue Department.
- **Company Profile:** the seller's name, address, tax ID and branch printed on every document, the bank
  account and PromptPay ID, the logo, the authorised signature and stamp, and the date the books start, with
  the cash in the bank that day.

### Accounting

- **Journal entries are generated from the records**: invoices, credit and debit notes, receipts, stock
  movements (cost of sales, returns, adjustments), goods receipts, supplier invoices and payments, and
  expenses. That way the books can't disagree with the operational screens.
- **Live reconciliation checks** on the overview: debits equal credits, the inventory account equals stock
  × landed cost, receivables equal what customers owe, and payables equal unpaid supplier invoices.
- **Expenses** (rent, delivery, fees, utilities…) are paid from the bank to an expense account.
  - **Tax:** VAT from the payee's tax invoice is reclaimable, and **withholding tax** (1/2/3/5%) can be
    kept back.
  - **Documents:** each expense prints a **payment voucher** (ใบสำคัญจ่าย), and one with tax withheld also
    prints a **withholding certificate** (50 ทวิ) for the payee.
- **Manual Journals** cover what no record does: accruals, owner's capital, corrections, bank charges.
  Entries must balance and can't touch the accounts the records drive (receivables, inventory, VAT,
  payables), so the checks keep holding. A wrong entry is reversed, never edited.
- **Bank Reconciliation** imports the bank's statement as CSV.
  - **Formats:** `date, description, amount, reference`, or withdrawal and deposit columns. Thai
    Buddhist-year dates and Thai Windows (TIS-620) encoding are understood.
  - **Matching:** lines already imported are skipped. The rest match automatically to book entries with the
    same amount within 5 days.
  - **Differences:** what's left shows on both sides. A line on the statement but not in the books can be
    recorded as a journal and matched in one step.
- **Month-end Close:** once a month is closed, nothing (expense, journal, supplier invoice) can be dated
  into it. Each open month shows what's still outstanding, and the latest closed month can be reopened with
  a reason.
- **Opening Balances**, for going live: import from spreadsheets what customers already owe (invoice by
  invoice, so it ages correctly), the stock already on the shelves (lot, warehouse, received date,
  quantity, cost) and supplier bills still unpaid.
  - **Checks:** each row goes through the same checks as everything else and posts against Opening balance
    equity, so the books balance from day one.
  - **Afterwards:** bills brought forward are paid like any other, and opening balances are fixed once the
    first month is closed.
- **Trial Balance**, **Profit & Loss** (down to net profit after operating expenses) and **Balance Sheet**.

### Across the system

- **Dashboard:** KPIs, a real-time status list of every order, exception lists (expiring licenses, aging
  stock, overdue or blocked imports, at-risk customers, orders ready to pick) and recent activity.
- **Approvals:** one queue for sales orders, import orders and purchase requests, with reject-with-reason
  and the approver's name and time on every decision. Nobody approves what they raised.
- **Notifications:** the bell lists what is waiting on the signed-in person, by role. That covers
  approvals and purchase requests, late deliveries and arrivals, overdue invoices, supplier bills due,
  expiring licenses and quotations, low stock, withholding tax to remit and unmatched bank lines.
- **Morning summary email:** the same list, emailed each morning to whoever turns it on (see
  [Running it](#morning-summary-email)).
- **Calendar:** arrivals, deliveries, payments due and license expiries. Colour shows the kind of event,
  a red outline means late, and struck-through means done.
- **Search and shortcuts:** **Ctrl K** or **/** searches orders (by order, tax invoice or delivery note
  number), customers (name, ID, tax ID), lots, products, suppliers, quotations, purchase requests, receipts
  and expenses. **N** starts a new record and **?** lists the shortcuts. Names and numbers throughout the
  app are links to their record.
- **Lot labels and scanning:** Stock Levels, Lot Trace and a shipment's receiving card print QR labels
  (choose how many copies).
  - **In search,** scanning a label opens that lot.
  - **On a stock count,** scanning a label jumps to that lot's line.
  - **Browsers:** scanning works with the camera in any current browser, on a phone, tablet or laptop. QR
    codes are read by the browser's own reader where it has one, and by a small built-in reader elsewhere
    (for example Windows and iPhone).
  - **HTTPS:** browsers allow the camera only on HTTPS or `localhost`.
  - **Without the app:** any phone's camera app also opens a label's link directly.
- **Reports:** net sales and gross margin, sales by SKU, channel and customer, inventory value by pipeline
  stage and by age, and a monthly tax-and-sales reconciliation.
- **Audit Trail:** every create, update, approval, rejection and payment, with the signed-in user and the
  old and new values. You can search it by record, user or text, and export it. Entries that mention money
  are hidden from roles without price access.
- **CSV import** on Products and Customers, and for opening balances. Download a template, fill it in Excel,
  and preview every row with its problems before importing the valid rows. Each row goes through the same
  rules as the form.
- **Views:** pages with more than one view open on the most useful one (Sales and Import Orders on the
  board, Customers on cards, Audit Trail on the activity feed, Licenses on the timeline). **Table** is
  always the last option, and each browser remembers the view you last chose on each page.
- **Thai / English** everywhere, switchable at any time. Every screen also works at phone width.
- **Text people type** is kept in Thai and English separately: expense descriptions, journal memos,
  quotation notes, purchase request reasons, reminder notes and the company's bank details.
  - **Forms:** each of these has a TH and an EN box. One is enough; it then shows in both languages, for
    text that's only ever written in one.
  - **Screens** show the language you're using.
  - **Printed documents** show Thai with English beneath.

---

## Printed documents and exports

Every printed document shares one layout:

- **Header:** title, number and dates at the top.
- **Parties:** seller and buyer side by side in identical boxes.
- **Labels:** every label in Thai, with English beneath.
- **Long documents:** column headings repeat and the title and "page n of N" appear on every page, while
  totals print once at the end.

| Document | From |
| --- | --- |
| Tax invoice (ใบกำกับภาษี, Revenue Code s.86/4), delivery note, picking list (grouped by warehouse) | a sales order |
| Receipt, credit note (ใบลดหนี้), debit note (ใบเพิ่มหนี้) | Receipts & Credit Notes |
| Quotation | Quotations |
| Statement of account, reminder letters | AR Aging → Collections, the customer page |
| Payment voucher (ใบสำคัญจ่าย), withholding certificate (50 ทวิ) | Expenses, supplier payments |
| Blind stock count sheet | Stock Counts |
| QR lot labels | Stock Levels, Lot Trace, receiving |

- **Tax invoices** carry everything the Revenue Code asks for:
  - seller and buyer name, address, 13-digit tax ID and head office or branch;
  - invoice number and date, and every line;
  - VAT shown separately;
  - the amount in words in Thai and English.

  Notes state the original invoice, the original and correct value, the VAT on the difference, and the
  reason.
- **How to pay:** invoices, statements and reminders show the bank account and a **PromptPay QR code** with
  the amount filled in.
- **Original and copy:** a tax invoice, receipt or credit/debit note can print the original, the copy, or
  both together.
- **Logo, signature and stamp:** the company **logo** goes on every document, and, when switched on, the
  **authorised signature and stamp** go on the documents the company issues. Roles without price access
  never receive the signature image.
- **The withholding certificate** follows the Revenue Department's 50 ทวิ layout:
  - tax IDs in boxes;
  - the payee's line number on the month's ภ.ง.ด.3/53;
  - the return-type and payment-type checkboxes;
  - the income rows;
  - copies 1 and 2.
- **Email:** documents can be emailed as an A4 **PDF**, rendered on the server by Chromium with Thai fonts,
  offline. Every sending is recorded on the record's history.
- **Spreadsheet exports** are Excel workbooks (.xlsx):
  - Thai and English headings, with a frozen heading row;
  - amounts as numbers and dates as dates;
  - IDs as text, so tax IDs keep their leading zero.

---

## Roles and permissions

Each action is limited to the roles that do that job. The same table is enforced by the API and shown in
the app under **Users & Access → What each role can do**.

| Role | Can do |
| --- | --- |
| Senior Manager | product prices, customer credit terms, open customers, price lists, company profile and opening balances, exchange rates, supplier invoices and payments, expenses, journals, bank reconciliation, month-end close, users |
| Order Officer | create and edit import orders, attach documents, products, suppliers, reorder policies, purchase requests |
| Documentation Officer | attach documents, record customs clearance, add and renew licenses |
| Warehouse Officer | receive goods, adjust stock, stock counts, update delivery status, warehouses, reorder policies, purchase requests |
| Tax Officer | record customs clearance, tax and duty rates, exchange rates, expenses and withholding tax |
| Sales Officer | quotations, create and edit sales orders, record payments, statements and reminders, open customers (credit terms start at 0) |
| Distribution Officer | update delivery status |
| Supervisor | everything above except managing users (they can view them) and closing months; approves and rejects orders and purchase requests |
| Guest | look at everything, change nothing |

**Who sees prices:** Senior Manager, Order Officer, Tax Officer, Sales Officer and Supervisor. For the other
roles, and for guests, the API removes cost prices, sales values, discounts, credit figures, tax amounts and
money in the audit trail before anything is sent.

---

## Business rules

Every write runs through the domain rules in `src/domain/` **on the server**. The screen often prevents a
mistake first, but the server checks again and answers with a reason (shown as a red message) instead of
doing the wrong thing.

| Rule | Where |
| --- | --- |
| Each action is allowed only for the roles that do that job (`ROLE_PERMISSIONS` in `src/data/identities.ts`) | everywhere |
| The raiser can't approve their own order; imports over ฿500,000 need two *different* supervisors | approvals |
| Approval re-checks stock and licenses at approval time, not just at entry | approvals |
| Import validation (SKU, ABV, price, quantity, license expiry, ETA, Type 5 cap) runs on create, every correction and every ETA change | import orders |
| Over-discount, over-credit and below-cost sales need a supervisor, including when editing a booked order | sales orders |
| Booked orders can be edited only until they ship; stock and balance move by the difference, line by line | sales orders |
| Units held by orders awaiting approval can't be promised to another order | sales orders |
| Orders for a customer with an invoice more than 60 days overdue need approval (credit hold) | sales orders |
| Delivery status only moves forward; Returned and Damaged are final | sales orders |
| Tax ID: 13 digits with a valid check digit; branch: 5 digits; address in Thai and English | customers, company |
| Payment terms 0–365 days; due date = invoice date + terms | customers, invoices |
| Stock changes only through receipts, sales, returns and reasoned adjustments; lot numbers are unique | inventory |
| One open count per warehouse; a count posts only when every lot is counted; differences are measured against the start of the count | stock counts |
| Renewing a license updates every customer holding it | licenses |
| An import order needs an exchange rate for its currency and keeps the rate it was placed at | import orders |
| One supplier invoice per received shipment; payments can't exceed what's owed | payables |
| A quotation converts once, before it expires, and only with enough free stock | quotations |
| One open purchase request per product; the requester can't approve it; only approved requests are ordered | purchase requests |
| Nothing is dated into a closed month; months close in order and only the latest reopens, with a reason | accounting |
| Journals balance and never touch receivables, inventory, VAT or payables; mistakes are reversed, not edited | accounting |
| Withholding needs the payee's valid tax ID; a month's tax is remitted once, after the month ends | expenses, tax |
| A statement line matches one book entry of the same amount; re-imported lines are skipped | bank |
| Opening balances can be added only by the company's set-up roles, and only until the first month is closed | opening balances |
| Five wrong passwords or codes lock an account for 15 minutes (a Senior Manager can unlock it) | sign-in |

---

## Running it

### Settings (`.env`)

Copy `.env.example` to `.env`. `npm run dev` does this for you, with fresh random secrets.

| Variable | Default | Meaning |
| --- | --- | --- |
| `POSTGRES_PASSWORD` | — | Database password. |
| `SESSION_SECRET` | — (required) | Signs sign-in sessions; at least 32 random characters. |
| `DEMO_MODE` | `true` | The header user switcher and **Reset demo data**. Set `false` for real use. |
| `ALLOW_GUEST` | follows `DEMO_MODE` | **Continue as guest** on the sign-in page. Set `false` to require sign-in. |
| `DEMO_PASSWORD` | `demo1234` | Password given to every seeded user on first start. |
| `SECURE_COOKIES` | `false` | Set `true` when served over HTTPS. |
| `TRUST_PROXY_HOPS` | `1` | Proxies in front of the API: nginx = 1; with the HTTPS front end, 2. |
| `WEB_PORT` | `8080` | Port the web app is published on. |
| `API_PORT` | `3000` | Port the API is published on, for this machine only (used by `npm run dev`). |
| `APP_URL` | `http://localhost:8080` | Where people open the app; links in emails point here. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | local Mailpit | Outgoing email (see below). |
| `MAIL_CATCHALL_URL` | `http://localhost:8025` | Where caught mail can be read; set it empty when sending for real. |
| `MAIL_UI_PORT` | `8025` | Port of the Mailpit mailbox, for this machine only. |
| `DIGEST_HOUR` | `7` | Hour (Bangkok time) the morning summary email goes out. |
| `REQUIRE_TWO_FACTOR_ROLES` | — | Roles that must use two-step sign-in, comma-separated, e.g. `seniorManager,supervisor`. Empty = optional for everyone. |
| `BACKUP_EVERY_HOURS` / `BACKUP_KEEP_DAYS` | `24` / `14` | Backup schedule and how long backups are kept. |
| `DOMAIN` | — | Domain for the optional HTTPS front end. |

### Email

Out of the box every email goes to **Mailpit**, a catch-all mailbox in the stack. Read the mail at
<http://localhost:8025>; nothing reaches real people. To send for real, set the `SMTP_*` variables and
set `MAIL_CATCHALL_URL=` (empty).

Documents are emailed as the page as it prints, with an A4 PDF attached. Run outside Docker without
Chromium, the API attaches the page as `.html` instead; set `CHROMIUM_PATH` to use a local Chrome.

### Morning summary email

Under **My account → Morning email** anyone can enter their email address and tick **Send me the summary
every morning**. After `DIGEST_HOUR` they get one email listing what is waiting on them: the same items as
the bell, each linking into the app at `APP_URL`. A day with nothing waiting sends nothing.

To test it:
- **Send me one now** sends one immediately.
- In demo mode, a Senior Manager or supervisor can run the whole morning pass at once with
  `POST /api/admin/digest/run`. The same rules apply: one per person per day.

### Backups

The `backup` service writes a database dump (`lisd-db-YYYYMMDD-HHMM.sql.gz`) and an archive of uploaded
documents (`lisd-uploads-….tar.gz`) into `./backups`. It does this when it starts and then every
`BACKUP_EVERY_HOURS`, keeping `BACKUP_KEEP_DAYS` days. To restore into a fresh, empty database:

```bash
docker compose down -v && docker compose up -d db            # empty database
gunzip -c backups/lisd-db-YYYYMMDD-HHMM.sql.gz | docker compose exec -T db psql -U lisd lisd
docker compose up -d                                         # start everything again
```

To restore the uploaded documents:
`docker compose run --rm -v "$PWD/backups:/backups" api sh -c "tar -xzf /backups/lisd-uploads-….tar.gz -C /data"`.

### HTTPS on a real domain

1. Point the domain's DNS at the server.
2. In `.env`, set `DOMAIN=erp.example.com`, `APP_URL=https://erp.example.com`, `SECURE_COOKIES=true` and
   `TRUST_PROXY_HOPS=2`. The value is 2 because both Caddy and nginx sit in front of the API.
3. Start with `docker compose --profile https up -d`.

Caddy obtains and renews the certificate automatically, redirects HTTP to HTTPS, and turns on HSTS. Camera
scanning needs HTTPS.

### Before real use

- Set `DEMO_MODE=false`. That removes the user switcher, **Reset demo data** and the public user list, and
  the sign-in page then asks for a username.
- Change every password, and use real secrets in `.env`.
- Set up real email and HTTPS.
- Consider `REQUIRE_TWO_FACTOR_ROLES`.
- Have an accountant check the tax settings and documents (see [Known limitations](#known-limitations)).

---

## Users, passwords and two-step sign-in

**In the app:** sidebar → **Users & Access**.

- **Managing users:** Senior Managers add users, change roles and names, set temporary passwords, unlock
  accounts, reset two-step sign-in, and disable or re-enable accounts.
- **Other roles:** supervisors see the list read-only. Other roles don't see the page, and the API refuses
  them too.

**Temporary passwords**
- New users and password resets get a **temporary password**, generated and copyable.
- The person must choose their own at their next sign-in before anything else works.

**Changing your password**
- Anyone can **change their own password** under **My account**, the key icon in the header.
- Changing or resetting a password signs that account out on every other device.

**Disabling accounts**
- Accounts are **disabled, never deleted**, so the audit trail keeps every name. Disabling signs the person
  out at once.
- You can't disable yourself or change your own role, and there is always at least one active Senior
  Manager.

**Two-step sign-in**
- **Setting it up:** **My account → Two-step sign-in**, scan the QR code with an authenticator app (Google
  Authenticator, Microsoft Authenticator, 1Password…) and type the code it shows. From then on, signing in
  asks for the app's 6-digit code after the password.
- **Codes:** each code works once, and wrong codes count towards the same lockout as wrong passwords.
- **Turning it off** needs the password.
- **Lost phone:** a Senior Manager can **reset** it for someone who lost their phone, which signs them out.
- **Required roles:** roles listed in `REQUIRE_TWO_FACTOR_ROLES` must set it up at their next sign-in and
  can't turn it off.
- **Demo mode:** the header user switcher bypasses sign-in entirely, which is why `DEMO_MODE=false` is
  needed for real use.

**Audit trail:** every change is recorded (record type "User"); passwords never are.

**From the terminal**, for example to create the first account, or if nobody can sign in:

```bash
npm run add-user                        # asks for username, role, Thai and English name, and password
npm run add-user -- --key nok --reset   # change an existing user's role, name or password
```

---

## Architecture

```
browser ──► web (nginx: built React app, proxies /api) ──► api (Node 22, Fastify) ──► db (PostgreSQL 16)
                                                              ├─ uploads volume (attached documents)
                                                              ├─ Chromium (documents → PDF)
                                                              └─ SMTP ──► mail (Mailpit, by default)
backup (pg_dump + uploads archive → ./backups)        https (Caddy, optional profile) ──► web
```

- **Stack.** React 19, React Router, Tailwind CSS and Vite on the web side. Fastify 5, zod, postgres.js,
  nodemailer and Playwright-driven Chromium on the API side. TypeScript throughout.
- **One copy of the business rules.** Every rule lives in `src/domain/`: approvals, stock and ledger moves,
  credit and debit notes, validation, permissions. The API runs that code. The web app only displays data
  and sends commands, so nothing can be bypassed from the browser.
- **Commands.** Every write is `POST /api/commands/<name>` with `{ "args": [...] }`. The API:
  1. checks the input's shape (zod);
  2. loads the data and runs the domain action;
  3. saves only the rows that changed, in one transaction that holds a database lock.

  The lock means two people can't oversell a lot or reuse an invoice number. The reply carries the new
  state, so the screen always matches the database. There are 61 commands; see `server/src/commands.ts`.
- **Books on demand.** The journal and trial balance are derived from the records (`src/domain/ledger.ts`)
  each time they're asked for, so there is no second copy that could drift.
- **Masking on the server.** Roles without price access never receive the hidden figures at all
  (`server/src/mask.ts`).
- **Sign-in.**
  - **Accounts:** users and scrypt password hashes are in the `users` table, and sessions are signed
    httpOnly cookies lasting 12 hours.
  - **Lockout:** five wrong passwords lock an account for 15 minutes. A made-up username "locks" the same
    way, so the answer doesn't reveal which usernames exist.
  - **Rate limit:** each address is limited to 100 failed sign-ins per 15 minutes. The count uses the
    address the app's own proxy saw, not a header a client could write.
  - **Two-step sign-in:** this uses standard TOTP (RFC 6238). The short-lived ticket between the password
    and the code is signed separately from sessions, so it can never stand in for one.
- **Hardening.**
  - **Headers:** content security policy, no framing, no MIME sniffing, and the camera allowed for the app
    itself only.
  - **Uploads** must really be the PDF or image they claim to be (10 MB maximum). They are stored on the
    `uploads` volume and served only to signed-in users.
  - **Supplier invoices** attached to import orders go only to roles with price access or that handle
    import paperwork.
  - **PDF rendering** happens offline, with scripts off.
- **Schema.** Migrations are in `server/sql/` (`001_init.sql` to `012_two_language_text.sql`). They run
  once each, in order, when the API starts; a new one is added as the next number.

### API

| Endpoint | |
| --- | --- |
| `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` | Sign in and out; the current user |
| `POST /api/auth/2fa/verify` | Second step of sign-in: the ticket from the password step plus the code |
| `POST /api/auth/2fa/setup`, `/enable`, `/disable` | Set up, turn on and turn off your own two-step sign-in |
| `POST /api/auth/password` | Change your own password |
| `POST /api/auth/guest`, `GET /api/auth/options` | Continue as guest (when allowed); what the sign-in page may offer |
| `GET /api/users` | Demo mode only: the sign-in list |
| `POST /api/auth/switch` | Demo mode only: act as another user |
| `GET /api/state` | All current data, masked for the caller's role (except the stock ledger and audit log) |
| `GET /api/audit`, `GET /api/stock-movements` | The audit log and stock ledger, filtered and a page at a time |
| `GET /api/stock-movements/monthly` | Units in and out per month |
| `GET /api/accounting/journal`, `GET /api/accounting/trial-balance` | The books (roles with price access) |
| `POST /api/commands/:name` | Any business write (61 commands) |
| `POST /api/import-orders/:orderNo/documents`, `GET /api/files/:id` | Upload (multipart `kind`, `file`) and download documents |
| `POST /api/email`, `GET /api/email/status` | Email a document (roles with price access); whether email is set up |
| `GET` / `POST /api/me/summary`, `POST /api/me/summary/send` | Your morning-email settings; send one now |
| `GET /api/admin/users`, `POST /api/admin/users`, `PATCH /api/admin/users/:key` | List, add and change users |
| `POST /api/admin/users/:key/password`, `POST /api/admin/users/:key/2fa/reset` | Temporary password; reset two-step sign-in |
| `POST /api/admin/reset`, `POST /api/admin/digest/run` | Demo mode only: reload the demo data; run the morning email now |
| `GET /api/health` | Health check |

### Where things are

| Path | What |
| --- | --- |
| `src/domain/` | Business rules (`actions.ts`), books (`ledger.ts`), finance helpers, notifications (`notices.ts`) |
| `src/pages/`, `src/components/` | Screens and shared UI (the document kit is `TaxDocument.tsx`) |
| `src/data/` | Types, roles and permissions, demo data |
| `src/i18n/translations.ts` | Every Thai and English text |
| `server/src/` | The API: routes, commands, sign-in, masking, email, PDF, morning email, two-step codes |
| `server/sql/` | Database migrations |
| `docker/` | nginx, security headers, Caddy, backup script |
| `scripts/` | `npm run dev`, `npm run add-user` |
| `tests/` | API and browser test suites |

---

## Development

### Web app with hot reload

```bash
npm install        # once
npm run dev        # http://localhost:5173
```

`npm run dev` gets everything it needs first:
- creates `.env` with random secrets if there isn't one;
- starts Docker Desktop if it's closed (Windows and macOS);
- starts the database and API in Docker, rebuilding the API only when its code changed, and waits until
  they're healthy;
- then runs Vite. If the API is already up, it goes straight to Vite.

**Ctrl+C** stops Vite, but the containers keep running; `npm run stop` stops them. `npm run dev:web` runs
Vite alone. The API is published on `127.0.0.1:3000`, this machine only; if port 3000 is taken, set
`API_PORT` in `.env`.

### Without Docker

```bash
docker compose up -d db                     # or any PostgreSQL 16 (expose it with the commented ports in docker-compose.yml)
cd server && npm install && npm run dev     # API on :3000 (DATABASE_URL defaults to localhost:5433)
npm install && npm run dev:web              # web on :5173, proxies /api to :3000
```

### Checks

```bash
npm run lint                     # oxlint
npm run build                    # typecheck and build the web app
cd server && npm run typecheck   # typecheck the API
```

---

## Tests

```bash
npm test                  # builds and starts the stack, then runs every suite (about 20 minutes)
npm run test:api          # API suite only (about a minute)
npm run test:e2e          # browser suites only
npm test -- workflows     # one suite: api | workflows | guest | crawl | required2fa
```

**The suites reset the demo data**, and remove the test accounts they create when they finish. The browser
suites use an installed Chrome or Edge (set `CHROME_PATH` if it's somewhere unusual), and screenshots go to
`tests/output/`.

| Suite | Checks |
| --- | --- |
| `tests/api.test.mjs` | ~345 checks: permissions, validation, masking, concurrency, sales and import workflows, costing, payables, expenses and withholding, journals, month-end close, bank reconciliation, quotations, purchase requests, opening balances, two-step sign-in, the morning email, paging, and the accounting invariants (the books agree with stock, receivables, payables and tax withheld) |
| `tests/e2e/workflows.mjs` | ~200 checks: the main workflows through the real UI, including printing, emailing, search, shortcuts, copy order, lot labels and **camera scanning** (with a simulated camera showing the real label) |
| `tests/e2e/guest.mjs` | the read-only guest experience |
| `tests/e2e/required-2fa.mjs` | restarts the API with two-step sign-in required for one role, checks the forced set-up, then restarts it as it was |
| `tests/e2e/crawl.mjs` | every page as five roles, in both languages, at desktop and phone widths; fails on console errors, missing translations or a page that scrolls sideways |

**CI** (`.github/workflows/ci.yml`): every push and pull request typechecks, lints and builds, then runs the
API suite against the real Docker stack. The browser suites run nightly and on demand.

---

## About the demo data

The demo data comes from the source spreadsheet wherever it had the data. Where it didn't, values were
reconstructed or invented, as noted here.

- **Order lines.** The 8 original import orders only had totals (SKU count, total value). Their lines were
  reconstructed to match each order's original total.
  - **Cost price:** the spreadsheet's cost price only makes sense as an all-in landed cost; with duty on
    top, sales would run at a loss.
  - **Supplier price:** each line's supplier price is therefore its share of the product's expected
    supplier price, in the supplier's currency at the rate on the order date. The expected supplier price is
    (cost − excise, Interior tax and levies) ÷ (1 + duty).
- **Licenses.** The two original import licenses (both expired) were kept as they are, rather than
  adding a fake valid one.
- **Customer balances.** The spreadsheet gives each customer's outstanding balance but only a few of the
  invoices behind it. The rest is carried as brought-forward documents (OB-…), dated relative to the reset
  so the aging report always shows a realistic mix.
- **Stock.** The spreadsheet's stock figures hadn't deducted the sales already taken from each lot, and two
  SKUs (Casa Roble Reposado, Riverside Craft Lager: 860 units) had stock but no lot.
  - **Derivation:** product stock is now the sum of the lots, which is what can actually be picked and
    traced.
  - **Opening lots:** those two SKUs carry an opening lot (`LOT-OPEN-…`, received 2026-05-01, an assumed
    date).
  - **Ledger:** the stock ledger is rebuilt from the seed lots and sales, so every lot's movements add up.
- **Dashboard KPIs** are computed live from the data, so the Dashboard never contradicts the module pages.
  - **Lead time:** planned import lead time runs from order date to ETA, since actual arrival dates aren't
    recorded.
  - **Inventory value:** stock at cost plus approved orders in transit.
  - **On-time delivery:** computed from orders delivered in the last 90 days against their planned
    delivery date. With no such orders, it shows the spreadsheet's figure, labelled **Sample figure**.
- **Invented for the demo:** warehouse addresses and capacities, reorder points, supplier contact emails
  (on the `.example` domain), delivery note numbers (the spreadsheet only had tax invoice numbers),
  product label history for 4 of the 12 SKUs, and the last three months of expenses and bank statement.
- **Derived from what the app used before:** suppliers come from the original import orders, and tax
  rates and price lists from the rates the app already used.

---

## Known limitations

- **Tax rates.** Import taxes follow the real structure, but rates change by ministerial regulation and FTA
  origins pay less duty. The defaults were checked in October 2026 against published sources (wine's 2024 cut,
  the 2017 tariff for spirits and beer, the Interior Ministry tax and the fund levies). The 60% duty on
  spirits and beer couldn't be confirmed from an official source. A government plan to fold the fund levies
  into ordinary excise was still a draft. Check the current Customs and Excise rates, and have an accountant
  check the documents, before any real use.
- **Accounting scope.** There is no year-end close (profit stays in "current year" on the balance sheet
  rather than rolling into retained earnings), no reverse-charge VAT (ภ.พ.36) on services bought from
  abroad, no post-dated cheque register, and no multi-branch or multi-company books.
- **No e-filing.** No Thai e-Tax Invoice (XML) or e-Withholding files; documents are printed or emailed as
  PDF, and withholding returns are produced as certificates and spreadsheet attachments.
- **Not covered:** payroll and a fixed-asset register (salaries and depreciation are entered as expenses or
  journals), a direct bank feed (statements are imported from CSV), and the API, Excel and email intake of
  import orders, which are simulated.
- **Scanning** reads QR codes in every browser; other barcodes (EAN, Code 128) only where the browser has
  its own barcode reader.
- **Scale.** The audit log and stock ledger are read a page at a time; the rest of the data comes in one
  `GET /api/state`, and each command reloads what it works on. That is simple and fast at this business's
  size, but a very large customer or order history would need the same paging for those screens. Writes
  are serialised by one database lock: correct and simple, but one write at a time.
- **Demo mode** is for demonstrations: anyone with the page can switch user and reset the data. Turn it
  off for real use.
