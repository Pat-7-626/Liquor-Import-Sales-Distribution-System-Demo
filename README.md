# Liquor Import, Sales & Distribution System — FE Demo

Frontend demo built from `Liquor_Import_Sales_Distribution_System_Requirements_v2.0.pdf` and
`liquor-import-fe-demo-data.xlsx`. No backend — everything runs client-side.

## Run

```bash
npm install
npm run dev
```

## What's here

- **Dashboard** — KPIs, a real-time status list of every order, and exception lists (expiring licenses,
  aging stock, at-risk customers, orders ready to pick).
- **Master data** — Products, Licenses, Customers, Inventory. Searchable tables, edit drawer, CSV export.
- **Detail pages** for Import Orders, Sales Orders, and Customers, each with its own audit history.
- **Import Orders** — new order form with 4 intake methods (API/Excel/Email are simulated, manual is real),
  auto-calculated tax/duty/VAT, license type checks, and a Staging→correct→approve flow. Line items are
  editable while an order is in Staging or flagged with an issue.
- **Sales Orders** — checks license, credit limit, and stock live as you build an order. Orders within the
  standard discount and credit limit book immediately. Orders over either limit go to a real Supervisor
  approval queue instead — nothing is booked or invoiced until a supervisor approves it.
- **Approvals** — one queue for both Import and Sales Orders needing action, with reject-with-reason and
  full name + timestamp on every decision. High-value import orders need two different supervisors.
- **Audit Trail** — every create/update/approve/reject, filterable.
- **Reports** — Sales by SKU/Channel/Customer, Inventory Value by pipeline stage and by aging, plus a
  monthly tax & sales reconciliation. CSV export and print-to-PDF.
- **Role switcher** in the header, covering all roles in the spec. Price/Credit/Discount are masked for
  roles that shouldn't see them; only Supervisors can approve or reject.
- **Thai/English toggle**, all content bilingual.

Everything is stored in one context (`src/state/DataContext.tsx`) and persisted to `localStorage`, so
changes survive a reload. Use **Reset demo data** in the sidebar to start over.

## Known limitations

This is frontend-only — no server, database, or real auth. A few things from the spec are genuinely out
of reach here, not faked:

- No real backend, so concurrent-user limits and automated backups can't be demonstrated.
- RBAC is a role switcher, not server-enforced — anyone can switch roles. The masking rules themselves
  are real and tested across every role and page.
- Data lives in `localStorage`, not a real retention/backup pipeline.
- The tax formula is illustrative, not the real Excise/Customs tariff schedule.
- Document attachments are in-memory only — they don't survive a reload.
- Layout isn't responsive below tablet width; the sidebar doesn't collapse, so phone-width screens are
  cramped. Tablet and up works fine.

## Data fidelity notes

The 8 original orders in the spreadsheet only had aggregate totals (SKU count, total value), not
line-item detail. Line items were reconstructed to match each order's original total, which was left
untouched. The two original import licenses (both expired) were kept as-is rather than adding a fake
valid one.

Two Dashboard KPIs — Inventory Value and Tax & Duty Cost — are computed live instead of showing the
spreadsheet's frozen numbers, because those two didn't reconcile with the underlying stock/order data.
The other 8 KPIs are exact copies of the spreadsheet.

`deliveryNoteNo` on Sales Orders has no source in the spreadsheet (it only had a tax invoice number) — a
delivery note number was generated so the print view has something to show. Product Label history has no
source at all in the spreadsheet; it's invented data seeded for 4 of the 12 SKUs.
