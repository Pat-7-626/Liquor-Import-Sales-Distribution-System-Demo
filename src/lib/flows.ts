// The lifecycle of an order as a row of steps — what the steppers draw. Dates come from the order's own
// status history, so a step shows when it actually happened and who did it.
import type { Bilingual, ImportOrder, SalesOrder, StatusEvent } from "../data/types";
import { todayIso } from "./business";

export type StepState = "done" | "current" | "next" | "upcoming" | "failed" | "skipped";

export interface FlowStep {
  key: string;
  /** Translation key for the step's name. */
  label: string;
  state: StepState;
  at?: string | null;
  actor?: Bilingual;
  /** Extra line under the label, e.g. "1 of 2 approvals". Translation key. */
  hint?: string;
  /** "failed" steps: amber (recoverable / goods back) or red (lost / refused). */
  tone?: "amber" | "red";
  /** A date the step is due by — the planned delivery, or the invoice's due date — and whether it's missed. */
  due?: { kind: "planned" | "payment" | "eta"; date: string; late: boolean };
}

/** Where an order's invoice stands, from receivables (payments settle the oldest-due invoices first). */
export interface PaymentInfo {
  open: number;
  dueDate: string;
}

/** The latest time the order reached any of these stages. */
function reached(history: StatusEvent[] | undefined, ...statuses: string[]): StatusEvent | undefined {
  return [...(history ?? [])].reverse().find((e) => statuses.includes(e.status));
}

/**
 * When nothing is in progress, the first step not yet done is what happens "next". When a step is
 * already in progress, that step is the focus and nothing else is marked.
 */
function markNext(steps: FlowStep[]): FlowStep[] {
  if (steps.some((s) => s.state === "current")) return steps;
  let marked = false;
  return steps.map((s) => {
    if (s.state !== "upcoming" || marked) return s;
    marked = true;
    return { ...s, state: "next" };
  });
}

/**
 * Order → (supervisor approval) → out for delivery → delivered (or returned / damaged) → paid.
 * `payment` is only known with price access; without it the Paid step is left out rather than guessed.
 */
export function salesFlow(
  o: Pick<SalesOrder, "approvalStatus" | "deliveryStatus" | "statusHistory" | "approver" | "createdBy" | "plannedDeliveryDate">,
  payment?: PaymentInfo | null,
  today: string = todayIso(),
): FlowStep[] {
  const h = o.statusHistory;
  const first = h?.[0];
  const neededApproval = Boolean(o.approvalStatus || o.approver || reached(h, "pendingApproval"));
  const steps: FlowStep[] = [{ key: "ordered", label: "flow.sales.ordered", state: "done", at: first?.at, actor: first?.actor ?? o.createdBy }];

  if (neededApproval) {
    const booked = reached(h, "pendingShipment", "inDelivery", "delivered", "returned", "damaged");
    if (o.approvalStatus === "pendingApproval") steps.push({ key: "approval", label: "flow.sales.approval", state: "current", hint: "flow.waitingSupervisor" });
    else if (o.approvalStatus === "rejected") {
      const r = reached(h, "rejected");
      steps.push({ key: "approval", label: "flow.sales.rejected", state: "failed", tone: "red", at: r?.at, actor: r?.actor });
    } else {
      const approvedAt = h?.find((e) => e.status === "pendingShipment");
      steps.push({ key: "approval", label: "flow.sales.approved", state: "done", at: approvedAt?.at ?? booked?.at, actor: approvedAt?.actor ?? o.approver ?? undefined });
    }
  }

  const blocked = Boolean(o.approvalStatus);
  const d = o.deliveryStatus;
  const shipped = reached(h, "inDelivery");
  const out = !blocked && ["inDelivery", "delivered", "returned", "damaged"].includes(d);
  steps.push({
    key: "inDelivery",
    label: "flow.sales.inDelivery",
    state: blocked ? (o.approvalStatus === "rejected" ? "skipped" : "upcoming") : d === "inDelivery" ? "current" : out ? "done" : "upcoming",
    at: out ? shipped?.at : undefined,
    actor: out ? shipped?.actor : undefined,
  });

  const end = reached(h, d);
  if (!blocked && (d === "returned" || d === "damaged")) {
    steps.push({ key: d, label: `flow.sales.${d}`, state: "failed", tone: d === "returned" ? "amber" : "red", at: end?.at, actor: end?.actor });
  } else {
    const delivered = d === "delivered" && !blocked;
    steps.push({
      key: "delivered",
      label: "flow.sales.delivered",
      state: blocked && o.approvalStatus === "rejected" ? "skipped" : delivered ? "done" : "upcoming",
      at: delivered ? end?.at : undefined,
      actor: delivered ? end?.actor : undefined,
      due:
        !delivered && o.approvalStatus !== "rejected" && o.plannedDeliveryDate
          ? { kind: "planned", date: o.plannedDeliveryDate, late: o.plannedDeliveryDate < today }
          : undefined,
    });
  }

  // Money: an invoice that's been issued and not reversed is paid once nothing of it is left open.
  if (payment && !blocked && d !== "returned" && d !== "damaged") {
    const paid = payment.open <= 0.005;
    steps.push({
      key: "paid",
      label: paid ? "flow.sales.paid" : "flow.sales.payment",
      state: paid ? "done" : "upcoming",
      due: paid ? undefined : { kind: "payment", date: payment.dueDate, late: payment.dueDate < today },
    });
  }
  return o.approvalStatus === "rejected" ? steps : markNext(steps);
}

const IMPORT_ORDER = ["staging", "pendingApproval", "firstApproved", "approved", "customsCleared", "receivedWarehouse"];

/** Raised → approval → approved → customs cleared → received; issues and rejections stop the line. */
export function importFlow(
  o: Pick<ImportOrder, "status" | "firstApprover" | "statusHistory" | "approver" | "createdBy" | "orderDate" | "etaDate">,
  today: string = todayIso(),
): FlowStep[] {
  const h = o.statusHistory;
  const rank = IMPORT_ORDER.indexOf(o.status === "pendingApproval" && o.firstApprover ? "firstApproved" : o.status);
  const ev = (...s: string[]) => reached(h, ...s);
  const raised = h?.[0];
  const stopped = o.status === "issueDetected" || o.status === "rejected";

  const steps: FlowStep[] = [
    o.status === "issueDetected"
      ? { key: "raised", label: "flow.import.issue", state: "failed", tone: "red", at: ev("issueDetected")?.at, actor: ev("issueDetected")?.actor, hint: "flow.fixToResubmit" }
      : { key: "raised", label: "flow.import.raised", state: "done", at: raised?.at ?? `${o.orderDate}T00:00:00`, actor: raised?.actor ?? o.createdBy },
  ];

  if (o.status === "rejected") {
    steps.push({ key: "approval", label: "flow.import.rejected", state: "failed", tone: "red", at: ev("rejected")?.at, actor: ev("rejected")?.actor, hint: "flow.fixToResubmit" });
  } else {
    const approved = rank >= IMPORT_ORDER.indexOf("approved");
    const first = ev("firstApproved");
    steps.push({
      key: "approval",
      label: approved ? "flow.import.approved" : "flow.import.approval",
      state: stopped ? "skipped" : approved ? "done" : rank >= 1 ? "current" : "upcoming",
      at: approved ? ev("approved")?.at : first?.at,
      actor: approved ? (ev("approved")?.actor ?? o.approver ?? undefined) : first?.actor,
      hint: !approved && o.firstApprover ? "flow.oneOfTwo" : !approved && rank >= 1 ? "flow.waitingSupervisor" : undefined,
    });
  }

  const later: [string, string][] = [
    ["customsCleared", "flow.import.customs"],
    ["receivedWarehouse", "flow.import.received"],
  ];
  for (const [status, label] of later) {
    const done = !stopped && rank >= IMPORT_ORDER.indexOf(status);
    steps.push({
      key: status,
      label,
      state: stopped ? "skipped" : done ? "done" : "upcoming",
      at: done ? ev(status)?.at : undefined,
      actor: done ? ev(status)?.actor : undefined,
      // The goods are expected in the warehouse on the ETA.
      // Only a live order is waiting on its ETA — one stopped by an issue or rejection isn't "late".
      due: status === "receivedWarehouse" && !done && !stopped ? { kind: "eta", date: o.etaDate, late: o.etaDate < today } : undefined,
    });
  }
  return stopped ? steps : markNext(steps);
}

/** Board columns for finished work show only what finished recently; older records stay in the table. */
export const BOARD_RECENT_DAYS = 30;

/** When an order reached its current stage (its last history entry), falling back to a known date. */
export function stageReachedOn(o: { statusHistory?: StatusEvent[] }, fallback: string): string {
  const at = o.statusHistory?.at(-1)?.at;
  return at ? at.slice(0, 10) : fallback;
}

/** Share of the happy path completed — for the compact progress line. */
export function flowProgress(steps: FlowStep[]): number {
  const done = steps.filter((s) => s.state === "done").length;
  return steps.length > 1 ? done / steps.length : 0;
}
