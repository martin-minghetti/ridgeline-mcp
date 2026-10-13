import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { z } from "zod";
import { findOrder, listUnpaidInvoices, listLowStock, salesSummary } from "@/lib/erp";
import { CUSTOMERS, getDataset, startOfDay } from "@/lib/data";
import { formatMoney, formatDate } from "@/lib/format";
import { verifyKey } from "@/lib/auth";
import { approvalSecret } from "@/lib/secret";
import { signApproval, NOTE_MAX } from "@/lib/approval";

type Ctx = { http?: { authInfo?: { clientId?: string; scopes?: string[] } } };
const text = (t: string, isError = false) => ({ content: [{ type: "text" as const, text: t }], ...(isError ? { isError: true } : {}) });

// One structured line per tool call: in a client project this feeds their log store / audit trail.
function logged<A>(tool: string, fn: (args: A, ctx: Ctx) => ReturnType<typeof text>, redact: (args: A) => object = (a) => a as object) {
  return async (args: A, ctx: Ctx) => {
    const t0 = Date.now();
    let isError = true;
    try {
      const result = fn(args, ctx);
      isError = !!result.isError;
      return result;
    } finally {
      console.log(JSON.stringify({ type: "mcp_tool_call", tool, client: ctx?.http?.authInfo?.clientId ?? "unknown", args: redact(args), isError, ms: Date.now() - t0 }));
    }
  };
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .refine((s) => { const d = new Date(`${s}T00:00:00Z`); return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s; }, "Not a real calendar date");

const handler = createMcpHandler((server) => {
  server.registerTool("find_order", {
    title: "Find order",
    description: "Look up one order by its number: status, customer, line items, total and invoice status.",
    inputSchema: z.object({ orderId: z.number().int().min(1).max(999999) }),
    annotations: { readOnlyHint: true },
  }, logged("find_order", ({ orderId }: { orderId: number }) => {
    const o = findOrder(orderId);
    if (!o) return text(`Order ${orderId} not found.`);
    const inv = o.invoice ? `${o.invoice.id}: ${o.invoice.paidAt ? `paid ${formatDate(o.invoice.paidAt)}` : `unpaid, due ${formatDate(o.invoice.dueAt)}`}` : "not invoiced yet";
    return text([
      `Order ${o.id} · ${o.status} · placed ${formatDate(o.createdAt)}`,
      `Customer: ${o.customer.name} (${o.customer.id}, ${o.customer.city})`,
      ...o.lines.map((l) => `- ${l.qty} × ${l.name} (${l.sku}) @ ${formatMoney(l.unitCents)} = ${formatMoney(l.lineCents)}`),
      `Total: ${formatMoney(o.totalCents)}`,
      `Invoice: ${inv}`,
    ].join("\n"));
  }));

  server.registerTool("list_unpaid_invoices", {
    title: "List unpaid invoices",
    description: "Unpaid invoices, most overdue first (max 20 rows), with the total amount outstanding.",
    inputSchema: z.object({ overdueOnly: z.boolean().default(true) }),
    annotations: { readOnlyHint: true },
  }, logged("list_unpaid_invoices", ({ overdueOnly }: { overdueOnly: boolean }) => {
    const r = listUnpaidInvoices({ overdueOnly });
    if (r.count === 0) return text(overdueOnly ? "No overdue invoices." : "No unpaid invoices.");
    return text([
      `${r.count} ${overdueOnly ? "overdue" : "unpaid"} invoice(s), ${formatMoney(r.totalCents)} outstanding${r.count > r.rows.length ? ` (showing ${r.rows.length})` : ""}:`,
      ...r.rows.map((i) => `- ${i.id} · ${i.customerName} · ${formatMoney(i.amountCents)} · due ${formatDate(i.dueAt)}${i.daysOverdue > 0 ? ` · ${i.daysOverdue} days overdue` : ""}`),
    ].join("\n"));
  }));

  server.registerTool("list_low_stock", {
    title: "List low stock",
    description: "Products at or below their reorder point, biggest shortfall first.",
    inputSchema: z.object({}),
    annotations: { readOnlyHint: true },
  }, logged("list_low_stock", () => {
    const r = listLowStock();
    if (r.length === 0) return text("All products are above their reorder point.");
    return text([`${r.length} product(s) need reordering:`, ...r.map((p) => `- ${p.name} (${p.sku}): ${p.stock} in stock, reorder point ${p.reorderPoint}, short by ${p.shortBy}`)].join("\n"));
  }));

  server.registerTool("sales_summary", {
    title: "Sales summary",
    description: "Order count, revenue, top 3 customers and top 3 products between two dates (inclusive, max 366 days). Demo data covers the last 75 days.",
    inputSchema: z.object({ from: isoDate, to: isoDate }),
    annotations: { readOnlyHint: true },
  }, logged("sales_summary", ({ from, to }: { from: string; to: string }) => {
    const r = salesSummary(new Date(`${from}T00:00:00Z`), new Date(`${to}T00:00:00Z`));
    if (!r.ok) return text(r.error, true);
    const oldest = getDataset(new Date()).orders.reduce((m, o) => Math.min(m, o.createdAt.getTime()), Infinity);
    const note = new Date(`${from}T00:00:00Z`).getTime() < oldest ? [`Note: demo data starts on ${new Date(oldest).toISOString().slice(0, 10)}.`] : [];
    return text([
      `Sales ${from} to ${to}: ${r.orderCount} order(s), ${formatMoney(r.revenueCents)} revenue.`,
      `Top customers: ${r.topCustomers.map((c) => `${c.name} (${formatMoney(c.revenueCents)})`).join(", ") || "none"}`,
      `Top products: ${r.topProducts.map((p) => `${p.name} (${p.qty} units)`).join(", ") || "none"}`,
      ...note,
    ].join("\n"));
  }));

  server.registerTool("request_follow_up_task", {
    title: "Request follow-up task",
    description: "Ask a human to approve a follow-up task for a customer. Nothing is written until someone opens the approval link and approves it. Requires the operator key.",
    inputSchema: z.object({ customerId: z.string().max(10), note: z.string().min(1).max(NOTE_MAX), dueDate: isoDate }),
    annotations: { readOnlyHint: false, destructiveHint: false },
  }, logged("request_follow_up_task", ({ customerId, note, dueDate }: { customerId: string; note: string; dueDate: string }, ctx: Ctx) => {
    const auth = ctx?.http?.authInfo;
    if (!auth?.scopes?.includes("erp:write")) return text("This key is read-only. Use the operator key to request write actions.", true);
    const secret = approvalSecret();
    const baseUrl = (process.env.PUBLIC_BASE_URL ?? "").trim().replace(/\/+$/, "");
    if (!secret || !baseUrl) return text("Server is not configured for approvals.", true);
    const today = startOfDay(new Date());
    const max = new Date(today.getTime() + 365 * 86_400_000);
    const due = new Date(`${dueDate}T00:00:00Z`);
    if (due < today || due > max) {
      const iso = (d: Date) => d.toISOString().slice(0, 10);
      return text(`dueDate must be between ${iso(today)} and ${iso(max)} (today is ${iso(today)}).`, true);
    }
    const customer = CUSTOMERS.find((c) => c.id === customerId);
    if (!customer) return text(`Customer ${customerId} not found.`, true);
    const token = signApproval({ customerId, customerName: customer.name, note, dueDate, requestedBy: auth.clientId ?? "unknown" }, secret);
    return text([
      `Follow-up task for ${customer.name} due ${dueDate} is waiting for approval. Not executed yet.`,
      `A person must approve it here (link valid 24 h): ${baseUrl}/approve?t=${token}`,
    ].join("\n"));
  }, ({ customerId, note, dueDate }) => ({ customerId, dueDate, noteLength: note.length })));
}, { serverInfo: { name: "ridgeline-supply-demo", version: "1.0.0" } });

const authed = withMcpAuth(handler, verifyKey, { required: true });
export { authed as GET, authed as POST };
