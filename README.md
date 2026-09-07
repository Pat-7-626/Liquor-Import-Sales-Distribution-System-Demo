# Liquor Import, Sales & Distribution System — FE Demo

Front-end demo built from `Liquor_Import_Sales_Distribution_System_Requirements_v2.0.pdf` and
`liquor-import-fe-demo-data.xlsx`. No real backend — see "Known limitations" below for what that means.

## Run

```bash
npm install
npm run dev
```

## What's here

**Dashboard** — KPIs plus an **All Orders** panel showing the real-time status of every Import Order and Sales
Order on one screen (BR-01), alongside the exception lists (expiring licenses, aging stock, at-risk customers).
Inventory Value, Tax & Duty Cost, and Outstanding Credit are computed live from the current data rather than
frozen at their original spreadsheet snapshot, so they always agree with the Reports page.

**Master data** — Products / SKU (with label history, FR-08), Licenses (expiring/expired ones surface as a live
count on the Licenses nav item, FR-07), Customers, Inventory: searchable/
filterable tables with status badges, an edit drawer, and real CSV export.

**Detail pages** — Import Orders, Sales Orders, and Customers each have a dedicated drill-down page (linked from
every list, from the Dashboard, from Approvals, and from Reports), not just an edit drawer: order overview,
related-record links (a Sales Order links to its Customer and back), and each record's own filtered slice of the
Audit Trail. Customers additionally show a credit-utilization bar and full Sales Order history. Products and
Licenses stay list-only — simple enough that the table row already shows everything a detail page would.

**Import Orders** (FR-01–17)
- **New Import Order** — pick an intake method (API/EDI, Excel/CSV, Email+OCR, or manual); the non-manual
  channels auto-fill a draft the way a real integration would (one with a bad SKU, one with an OCR-garbled ABV)
  so the line-by-line validation has something to catch. Also references a specific Import License (FR-09) —
  Type 1 and Type 5 carry visibly different conditions (volume cap, bond requirement), and the order is flagged
  if the license is expired or its ETA falls after the license's expiry (§7.1's "imported within the license
  period" check). Captures the logistics/financial fields from the spec's data section (BL/AWB,
  origin/destination, currency, payment terms) and computes an Excise Tax / Import Duty / VAT / stamp-count
  breakdown per order (FR-10–12 — an illustrative demo formula, not the real tariff schedule).
- **Order detail page** — overview (including an explicit Customs Clearance Status, FR-12), logistics, tax
  breakdown, line items, document attachments (FR-06), goods receiving with a discrepancy check (FR-13–15,
  creates real inventory lots), and the order's own audit history. While an order is in Staging or Issue
  Detected, its line items are directly editable (FR-05) — corrections re-run the same FR-04 validation live and
  clear the order back to Staging once every line passes, unblocking it for approval.

**Sales Orders** (FR-18–26)
- **New Sales Order** — live-checks the customer's liquor license and lot/batch stock as you build the order;
  price defaults adjust by sales channel (FR-26). Within the standard discount and credit limit, confirming books
  the order immediately (decrements the fulfilling lot/product stock, updates the customer's balance). Over the
  standard discount and/or over the credit limit (FR-22, FR-28), it's submitted to the Approvals queue instead —
  genuinely unbooked (no stock, no credit impact, no invoice/delivery numbers) until a real supervisor identity
  Approves it there; only then do the deferred stock/credit/document effects actually happen, and the approver
  recorded is whoever really clicked Approve, not a name the Sales Officer picked from a list. A supervisor can
  knowingly approve an order that pushes a customer over their credit limit — that's the point of routing it to a
  human decision instead of an unconditional block.
- **Documents** action on each order — printable Tax Invoice, Delivery Note, and Picking List (FR-16, FR-23);
  disabled while an order is pending/rejected approval, since nothing's been issued yet.
- Delivery Status (In Delivery/Delivered/Returned/Damaged) is editable by anyone, independent of the
  price/discount masking (FR-24) — Distribution Officers can update it even though they can't see sensitive
  figures. Marking a delivery **Returned** restocks the fulfilling lot; **Damaged** is logged as a write-off (FR-17).

**Approvals** (FR-27–29) — a supervisor queue showing only orders actually awaiting action, with
Approve/Reject-with-reason (required — the Reject button opens a modal that won't submit without one) and a
full name+timestamp on every approval/rejection. Covers both Import Orders and Sales Orders awaiting approval
over discount or credit limit (FR-22, FR-28), each showing why it needs approval. Import orders over ฿500,000
need two approvals from two *different* supervisors (FR-28's multi-level case) — the UI blocks the same person
from giving both.

**Audit Trail** (BR-04) — every create/update/approve/reject across every entity, with actor and timestamp,
filterable by record type, action, and record ID.

**Reports** (BR-05, BR-09, FR-25) — Sales by SKU / Channel / Customer; Inventory Value by *Pipeline* Status (In
Transit/Customs Clearance vs. Available for Sale — the axis BR-09 and the KPI table actually specify) and,
separately, by *Aging* Status (Normal/Starting to Age/Long Aging, matching the Aging Stock Report requirement).
Each section has CSV export; the whole page is print-to-PDF via the browser's native print dialog.

**Role-based access** (NFR-03) — a "Signed in as" switcher in the header covering all 8 roles from the spec.
Price, Credit, and Discount figures are masked for roles other than Sales Officer/Supervisor/Senior Manager/Tax
Officer/Order Officer, and editing those fields is disabled to match. Only Supervisors can approve/reject.

**TH / EN toggle** in the top bar — all labels, statuses, and customer/supplier names are bilingual.

All entity data — plus the audit log — lives in one store (`src/state/DataContext.tsx`, seeded from
`src/data/*.ts`) shared across every page and persisted to `localStorage`, so edits, new orders, and approvals
survive a page reload (an approximation of NFR-02/06 for a backend-less demo). Use **Reset demo data** in the
sidebar to wipe it and start over. Translations are in `src/i18n/translations.ts`.

## Known limitations

This is a frontend-only demo — no server, no database, no real auth. A few requirements from the spec can't be
honestly claimed as a result, and weren't faked:
- **NFR-01** (20 concurrent users) is a backend/infra characteristic — nothing to build here; there's no
  server for "concurrent" to mean anything.
- **NFR-05** (3s page load) — measured on a production build (`vite preview`), not just claimed: the initial
  bundle loads in ~190ms and every subsequent in-app page navigation in ~10-15ms (client-side routing, no
  network round-trip). That's on localhost with no real network latency, but the whole app is a ~122KB gzipped
  JS bundle, so it stays well under 3s on any realistic connection.
- **NFR-03** RBAC is simulated via a role switcher, not enforced server-side — anyone can switch roles freely.
  Within that simulation, masking of Price/Credit/Discount is real and was swept across all 9 roles × every
  page (including the Approvals queue) with a scripted check, not just spot-checked.
- **NFR-02/06** persistence is `localStorage`, not a real backup/retention pipeline. Nothing in the app
  actively works against 2-year retention (the audit log is never trimmed or capped), but `localStorage` isn't
  a durable, regulator-grade store either.
- The tax/duty formula (FR-10–11) is illustrative, not the actual Excise/Customs tariff schedule.
- Document attachments (FR-06) are in-memory object URLs — they don't survive a reload and aren't real uploads.
- No responsive layout below tablet width (~768px) — the sidebar is fixed-width with no collapse/hamburger
  behavior, so phone-width viewports (~390px) are cramped to the point of being hard to use. The spec describes
  a back-office system with no stated mobile/responsive requirement; tablet width and up is fully usable.

## Data fidelity notes

The 8 original Import Orders and Sales Orders came from `liquor-import-fe-demo-data.xlsx` with only aggregate
totals (SKU count, total value) — the sheet never itemized per-line SKU/ABV/quantity/price. To power the tax
breakdown and detail pages for those specific 8 orders, line items were reconstructed to match each order's
original `totalValue` as closely as possible (that field itself was left untouched, as the source of truth).
IMP-2026-0149's reconstructed line deliberately carries an 85% ABV — that's the actual bad data implied by its
pre-existing "ABV mismatch" note, not a new fabrication. The two original import licenses (both already expired)
were **not** supplemented with an invented valid one; the New Import Order flow treats "no license selected" as
its own clean, non-blocking path instead.

Two Dashboard KPI cards — **Inventory Value** and **Tax & Duty Cost** — are computed live from the current
Import Orders / Inventory data rather than showing the spreadsheet's frozen `Dashboard_KPI` figures (฿8,450,000
and ฿612,000). Those two source numbers don't reconcile with any breakdown of the underlying Inventory_Stock /
Import_Orders sheets, so live computation was used instead to keep the Dashboard, Reports, and detail pages
mutually consistent — this is a deliberate deviation from the literal source values, not an error. The other 8
KPI cards are exact copies of the spreadsheet's figures.

`deliveryNoteNo` on Sales Orders (e.g. `DN-2026-6601`) has no source in the spreadsheet — the sheet only
provides a tax invoice number. A delivery note number was synthesized (derived from the invoice number) so the
Delivery Note print view (FR-16/23) has something to display.

The Product Label version history (FR-08, `src/data/productLabels.ts`) has **no source in the spreadsheet at
all** — the Products_SKU sheet has no label-related columns. Every registered date, version number, and note for
the 4 SKUs that have label history is invented, purely to give the FR-08 feature something to display. It's
seeded for 4 of the 12 SKUs (not all) to also show the empty-state UI.
