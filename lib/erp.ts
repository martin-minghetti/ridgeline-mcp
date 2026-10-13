import { getDataset, PRODUCTS, startOfDay, type Customer, type Invoice, type OrderStatus, type Product } from "./data";

const DAY = 86_400_000;
const MAX_ROWS = 20;

export type OrderDetail = {
  id: number; status: OrderStatus; createdAt: Date; customer: Customer;
  lines: { sku: string; name: string; qty: number; unitCents: number; lineCents: number }[];
  totalCents: number; invoice: Invoice | null;
};

export function findOrder(id: number, now = new Date()): OrderDetail | null {
  const ds = getDataset(now);
  const o = ds.orders.find((x) => x.id === id);
  if (!o) return null;
  const lines = o.lines.map((l) => ({
    sku: l.sku, name: PRODUCTS.find((p) => p.sku === l.sku)!.name, qty: l.qty, unitCents: l.unitCents, lineCents: l.qty * l.unitCents,
  }));
  return {
    id: o.id, status: o.status, createdAt: o.createdAt, customer: ds.customers.find((c) => c.id === o.customerId)!,
    lines, totalCents: lines.reduce((s, l) => s + l.lineCents, 0), invoice: ds.invoices.find((i) => i.orderId === o.id) ?? null,
  };
}

export function listUnpaidInvoices(opts: { overdueOnly: boolean }, now = new Date()) {
  const ds = getDataset(now);
  const today = startOfDay(now).getTime();
  const all = ds.invoices
    .filter((i) => i.paidAt === null)
    .map((i) => ({ ...i, customerName: ds.customers.find((c) => c.id === i.customerId)!.name, daysOverdue: Math.floor((today - i.dueAt.getTime()) / DAY) }))
    .filter((i) => !opts.overdueOnly || i.daysOverdue > 0)
    .sort((a, b) => b.daysOverdue - a.daysOverdue);
  return { rows: all.slice(0, MAX_ROWS), count: all.length, totalCents: all.reduce((s, i) => s + i.amountCents, 0) };
}

export function listLowStock(): (Product & { shortBy: number })[] {
  return PRODUCTS.filter((p) => p.stock <= p.reorderPoint)
    .map((p) => ({ ...p, shortBy: p.reorderPoint - p.stock }))
    .sort((a, b) => b.shortBy - a.shortBy)
    .slice(0, MAX_ROWS);
}

export function salesSummary(from: Date, to: Date, now = new Date()) {
  if (from.getTime() > to.getTime()) return { ok: false as const, error: "`from` must be on or before `to`." };
  if (to.getTime() - from.getTime() > 366 * DAY) return { ok: false as const, error: "Range too long: maximum is 366 days." };
  const ds = getDataset(now);
  const start = startOfDay(from).getTime(), end = startOfDay(to).getTime() + DAY;
  const orders = ds.orders.filter((o) => o.status !== "cancelled" && o.createdAt.getTime() >= start && o.createdAt.getTime() < end);
  const byCustomer = new Map<string, number>(), byProduct = new Map<string, number>();
  let revenueCents = 0;
  for (const o of orders) {
    const total = o.lines.reduce((s, l) => s + l.qty * l.unitCents, 0);
    revenueCents += total;
    byCustomer.set(o.customerId, (byCustomer.get(o.customerId) ?? 0) + total);
    for (const l of o.lines) byProduct.set(l.sku, (byProduct.get(l.sku) ?? 0) + l.qty);
  }
  const top = <T,>(m: Map<string, number>, f: (k: string, v: number) => T) => [...m].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => f(k, v));
  return {
    ok: true as const, orderCount: orders.length, revenueCents,
    topCustomers: top(byCustomer, (k, v) => ({ name: ds.customers.find((c) => c.id === k)!.name, revenueCents: v })),
    topProducts: top(byProduct, (k, v) => ({ name: PRODUCTS.find((p) => p.sku === k)!.name, qty: v })),
  };
}
