import { describe, it, expect } from "vitest";
import { getDataset, FIRST_ORDER_ID, ORDER_COUNT } from "@/lib/data";
import { findOrder, listUnpaidInvoices, listLowStock, salesSummary } from "@/lib/erp";
import { formatMoney } from "@/lib/format";

const NOW = new Date("2026-10-13T15:00:00Z");
const DAY = 86_400_000;

describe("dataset", () => {
  it("is deterministic and complete", () => {
    const a = getDataset(NOW), b = getDataset(NOW);
    expect(a.orders).toEqual(b.orders);
    expect(a.orders).toHaveLength(ORDER_COUNT);
    expect(a.orders[0].id).toBe(FIRST_ORDER_ID);
  });
  it("moves with the clock so the demo never goes stale", () => {
    const later = new Date(NOW.getTime() + 400 * DAY);
    expect(getDataset(later).orders[0].createdAt.getTime() - getDataset(NOW).orders[0].createdAt.getTime()).toBe(400 * DAY);
  });
  it("has at least 3 overdue invoices and 3 low-stock products", () => {
    expect(listUnpaidInvoices({ overdueOnly: true }, NOW).count).toBeGreaterThanOrEqual(3);
    expect(listLowStock().length).toBeGreaterThanOrEqual(3);
  });
});

describe("findOrder", () => {
  it("returns order 1042 with customer, lines and total", () => {
    const o = findOrder(1042, NOW)!;
    expect(o.id).toBe(1042);
    expect(o.customer.name).toBeTruthy();
    expect(o.totalCents).toBe(o.lines.reduce((s, l) => s + l.lineCents, 0));
  });
  it("returns null for an unknown id", () => {
    expect(findOrder(9999, NOW)).toBeNull();
  });
});

describe("listUnpaidInvoices", () => {
  it("only returns unpaid invoices, most overdue first, max 20 rows", () => {
    const r = listUnpaidInvoices({ overdueOnly: false }, NOW);
    expect(r.rows.every((i) => i.paidAt === null)).toBe(true);
    expect(r.rows.length).toBeLessThanOrEqual(20);
    for (let i = 1; i < r.rows.length; i++) expect(r.rows[i - 1].daysOverdue).toBeGreaterThanOrEqual(r.rows[i].daysOverdue);
    expect(r.count).toBeGreaterThanOrEqual(r.rows.length);
  });
  it("overdueOnly filters to past-due invoices", () => {
    expect(listUnpaidInvoices({ overdueOnly: true }, NOW).rows.every((i) => i.daysOverdue > 0)).toBe(true);
  });
});

describe("listLowStock", () => {
  it("returns products at or below reorder point, biggest gap first", () => {
    const r = listLowStock();
    expect(r.every((p) => p.stock <= p.reorderPoint)).toBe(true);
    expect(r[0].sku).toBe("RS-130");
  });
});

describe("salesSummary", () => {
  it("summarises the last 30 days", () => {
    const r = salesSummary(new Date(NOW.getTime() - 30 * DAY), NOW, NOW);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.orderCount).toBeGreaterThan(0);
      expect(r.topCustomers.length).toBeLessThanOrEqual(3);
    }
  });
  it("rejects from after to", () => {
    expect(salesSummary(NOW, new Date(NOW.getTime() - DAY), NOW)).toEqual({ ok: false, error: "`from` must be on or before `to`." });
  });
  it("rejects ranges over 366 days", () => {
    expect(salesSummary(new Date(NOW.getTime() - 400 * DAY), NOW, NOW)).toEqual({ ok: false, error: "Range too long: maximum is 366 days." });
  });
});

it("formats money", () => {
  expect(formatMoney(123450)).toBe("$1,234.50");
});
