# Ridgeline MCP Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A public, always-on demo MCP server that connects Claude to the "back office" of a fictional distributor (Ridgeline Supply): look up orders, overdue invoices, low stock, sales summaries, and request a follow-up task that only runs after a human approves it.

**Architecture:** One Next.js 16 app on Vercel. `lib/erp.ts` plays the client's existing system (fixed demo data in code, dates computed relative to "now" so the demo never goes stale). `app/api/mcp/route.ts` exposes 5 MCP tools through `mcp-handler`, protected by a bearer key per role. The single write tool never writes: it returns an HMAC-signed approval link; `/approve` verifies the signature and shows the approval step. Every tool call emits one structured JSON log line. No database, no Blob, no KV: nothing that can pause, fill up or expire.

**Tech Stack:** Next.js 16.3.6, React 19.3.0, mcp-handler 2.2.0, @modelcontextprotocol/server 2.2.0, zod 4.6.5, TypeScript 5.9.3, Vitest 5.0.2, Node 20+.

**Spec:** Vault note `projects/upwork/2026-10-13-mcp-que-busca-la-gente.md` (what Upwork clients ask for, platform checks) plus the decisions in this plan's Global Constraints.

## Global Constraints

- Exact versions: `next@16.3.6 react@19.3.0 react-dom@19.3.0 mcp-handler@2.2.0 @modelcontextprotocol/server@2.2.0 zod@4.6.5`; dev: `typescript@5.9.3 vitest@5.0.2 @types/node@24.19.0 @types/react@19.3.0`. No other runtime dependencies.
- No database, Vercel Blob, KV, Redis or any external service. State lives in code (data) or in signed URLs (approvals).
- All repo text (README, UI copy, comments, commit messages) in English.
- The deployed site must not advertise services: no "hire me", no Upwork or pricing links (Vercel Hobby forbids commercial use). A GitHub repo link is fine.
- All data is fictional. The landing page and README say so ("Demo data, fictional company").
- Auth: `Authorization: Bearer <key>`. `DEMO_READ_KEY` → scopes `["erp:read"]`; `DEMO_WRITE_KEY` → scopes `["erp:read","erp:write"]`. Any other or missing key → HTTP 401.
- Env vars: `DEMO_READ_KEY`, `DEMO_WRITE_KEY`, `APPROVAL_SECRET` (≥32 chars), `PUBLIC_BASE_URL` (e.g. `https://ridgeline-mcp.vercel.app`).
- Tool results are bounded: never more than 20 rows per list.
- Money is stored as integer cents and shown as `$1,234.50` (USD).
- Exactly 5 tools: `find_order`, `list_unpaid_invoices`, `list_low_stock`, `sales_summary`, `request_follow_up_task`.
- Repo: `~/Projects/ridgeline-mcp`, GitHub `martin-minghetti/ridgeline-mcp` (public), Vercel project `ridgeline-mcp` on team `martins-projects-91f0c43f`.

## Review Focus

1. Unknown order id (e.g. `9999`) → a plain "Order 9999 not found" tool result, not a thrown error or 500. Test in Task 3.
2. A read-only key calling `request_follow_up_task` → tool result with `isError: true` and text "This key is read-only", no approval link issued. Test in Task 3.
3. Tampered or expired approval link → `/approve` shows "This approval link is invalid or expired" and offers no approve button. Test in Task 2 (verify) and Task 4 (page).
4. `sales_summary` with `from` after `to`, or a range over 366 days → validation message, not a crash. Test in Task 1.
5. A follow-up note containing HTML/script text (prompt-injection style) → rendered as plain text on `/approve`, capped at 500 chars. Test in Task 2 (cap) and Task 4 (escaping).

---

## File Structure

```
ridgeline-mcp/
  package.json, tsconfig.json, next.config.ts, vitest.config.ts, .gitignore, .env.example, LICENSE, README.md
  lib/data.ts          fictional dataset (products, customers, generated orders/invoices) + date helpers
  lib/erp.ts           query functions over the dataset (the "client's system")
  lib/format.ts        money/date formatting
  lib/auth.ts          bearer key → AuthInfo with scopes
  lib/approval.ts      sign / verify approval tokens (HMAC-SHA256)
  app/api/mcp/route.ts MCP server: 5 tools, scope check, structured log
  app/approve/page.tsx approval screen (verify token, approve form)
  app/approve/actions.ts server action that re-verifies and confirms
  app/page.tsx         landing page: what it is, MCP URL, how to connect
  app/layout.tsx       minimal layout + inline CSS
  tests/*.test.ts      vitest suites
```

---

### Task 1: Scaffold, dataset and ERP queries

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `vitest.config.ts`, `.gitignore`, `.env.example`, `lib/data.ts`, `lib/format.ts`, `lib/erp.ts`, `app/layout.tsx`, `app/page.tsx` (placeholder `export default () => null` replaced in Task 4)
- Test: `tests/erp.test.ts`

**Interfaces:**
- Produces:
  - `type Product = { sku: string; name: string; stock: number; reorderPoint: number; priceCents: number }`
  - `type Customer = { id: string; name: string; city: string }`
  - `type Order = { id: number; customerId: string; createdAt: Date; status: "processing" | "shipped" | "delivered" | "cancelled"; lines: { sku: string; qty: number; unitCents: number }[] }`
  - `type Invoice = { id: string; orderId: number; customerId: string; issuedAt: Date; dueAt: Date; amountCents: number; paidAt: Date | null }`
  - `getDataset(now: Date): { products: Product[]; customers: Customer[]; orders: Order[]; invoices: Invoice[] }`
  - `findOrder(id: number, now?: Date): OrderDetail | null` where `OrderDetail = { id; status; createdAt: Date; customer: Customer; lines: { sku; name; qty; unitCents; lineCents }[]; totalCents: number; invoice: Invoice | null }`
  - `listUnpaidInvoices(opts: { overdueOnly: boolean }, now?: Date): { rows: (Invoice & { customerName: string; daysOverdue: number })[]; totalCents: number; count: number }`
  - `listLowStock(): (Product & { shortBy: number })[]`
  - `salesSummary(from: Date, to: Date, now?: Date): { ok: true; orderCount: number; revenueCents: number; topCustomers: { name: string; revenueCents: number }[]; topProducts: { name: string; qty: number }[] } | { ok: false; error: string }`
  - `formatMoney(cents: number): string`, `formatDate(d: Date): string` (YYYY-MM-DD)

- [ ] **Step 1: Scaffold the project**

```bash
cd ~/Projects/ridgeline-mcp
npm init -y >/dev/null
npm install --save-exact next@16.3.6 react@19.3.0 react-dom@19.3.0 mcp-handler@2.2.0 @modelcontextprotocol/server@2.2.0 zod@4.6.5
npm install --save-exact -D typescript@5.9.3 vitest@5.0.2 @types/node@24.19.0 @types/react@19.3.0
```

Set `package.json` fields: `"name": "ridgeline-mcp"`, `"private": true`, `"license": "MIT"`, `"engines": {"node": ">=20"}`, scripts `{"dev": "next dev", "build": "next build", "start": "next start", "test": "vitest run"}`.

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022", "lib": ["dom", "dom.iterable", "es2022"], "strict": true, "noEmit": true,
    "module": "esnext", "moduleResolution": "bundler", "resolveJsonModule": true, "isolatedModules": true,
    "jsx": "preserve", "skipLibCheck": true, "esModuleInterop": true, "incremental": true,
    "plugins": [{ "name": "next" }], "baseUrl": ".", "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

`next.config.ts`:
```ts
import type { NextConfig } from "next";
const config: NextConfig = {};
export default config;
```

`vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({
  test: { environment: "node" },
  resolve: { alias: { "@": path.resolve(__dirname) } },
});
```

`.gitignore`: `node_modules`, `.next`, `.env*.local`, `.vercel`, `next-env.d.ts`, `*.tsbuildinfo`.

`.env.example`:
```
DEMO_READ_KEY=read-demo-key-change-me
DEMO_WRITE_KEY=write-demo-key-change-me
APPROVAL_SECRET=at-least-32-random-characters-here-please
PUBLIC_BASE_URL=http://localhost:3000
```

`app/layout.tsx`:
```tsx
export const metadata = { title: "Ridgeline Supply · MCP demo", description: "Demo MCP server: Claude connected to a fictional distributor's back office." };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", maxWidth: 720, margin: "40px auto", padding: "0 16px", lineHeight: 1.55, color: "#1b1d21" }}>
        {children}
      </body>
    </html>
  );
}
```

`app/page.tsx` (placeholder): `export default function Home() { return null; }`

- [ ] **Step 2: Write the dataset**

`lib/data.ts`:
```ts
export type Product = { sku: string; name: string; stock: number; reorderPoint: number; priceCents: number };
export type Customer = { id: string; name: string; city: string };
export type OrderStatus = "processing" | "shipped" | "delivered" | "cancelled";
export type Order = { id: number; customerId: string; createdAt: Date; status: OrderStatus; lines: { sku: string; qty: number; unitCents: number }[] };
export type Invoice = { id: string; orderId: number; customerId: string; issuedAt: Date; dueAt: Date; amountCents: number; paidAt: Date | null };

export const PRODUCTS: Product[] = [
  { sku: "RS-100", name: "Nitrile gloves (box of 100)", stock: 420, reorderPoint: 150, priceCents: 1290 },
  { sku: "RS-110", name: "Safety goggles", stock: 38, reorderPoint: 60, priceCents: 890 },
  { sku: "RS-120", name: "High-vis vest", stock: 210, reorderPoint: 80, priceCents: 1450 },
  { sku: "RS-130", name: "Hard hat", stock: 12, reorderPoint: 40, priceCents: 2490 },
  { sku: "RS-140", name: "Ear defenders", stock: 95, reorderPoint: 50, priceCents: 1990 },
  { sku: "RS-150", name: "Work boots (pair)", stock: 64, reorderPoint: 30, priceCents: 8900 },
  { sku: "RS-160", name: "First aid kit", stock: 7, reorderPoint: 25, priceCents: 4500 },
  { sku: "RS-170", name: "Dust masks (pack of 20)", stock: 300, reorderPoint: 120, priceCents: 1750 },
  { sku: "RS-180", name: "Cut-resistant gloves", stock: 55, reorderPoint: 70, priceCents: 1190 },
  { sku: "RS-190", name: "Fire extinguisher 5 lb", stock: 22, reorderPoint: 15, priceCents: 5990 },
  { sku: "RS-200", name: "Safety cones (set of 6)", stock: 18, reorderPoint: 20, priceCents: 6400 },
  { sku: "RS-210", name: "Spill kit", stock: 30, reorderPoint: 10, priceCents: 12900 },
];

export const CUSTOMERS: Customer[] = [
  { id: "C-01", name: "Harbor Logistics", city: "Portland" },
  { id: "C-02", name: "Summit Builders", city: "Denver" },
  { id: "C-03", name: "Bluewater Marine", city: "Seattle" },
  { id: "C-04", name: "Pinecrest Facilities", city: "Boise" },
  { id: "C-05", name: "Ironclad Fabrication", city: "Spokane" },
  { id: "C-06", name: "Meadow Valley Farms", city: "Fresno" },
  { id: "C-07", name: "Northgate Warehousing", city: "Tacoma" },
  { id: "C-08", name: "Cedar Point Schools", city: "Eugene" },
  { id: "C-09", name: "Granite Peak Mining", city: "Reno" },
  { id: "C-10", name: "Lakeside Clinic Group", city: "Salem" },
];

const DAY = 86_400_000;
export const ORDER_COUNT = 60;
export const FIRST_ORDER_ID = 1001;

// Deterministic PRNG so every deploy and every test sees the same dataset.
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function startOfDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function getDataset(now: Date) {
  const today = startOfDay(now);
  const rand = mulberry32(42);
  const orders: Order[] = [];
  const invoices: Invoice[] = [];
  for (let i = 0; i < ORDER_COUNT; i++) {
    const id = FIRST_ORDER_ID + i;
    const daysAgo = Math.floor(rand() * 75);
    const createdAt = new Date(today.getTime() - daysAgo * DAY);
    const customer = CUSTOMERS[Math.floor(rand() * CUSTOMERS.length)];
    const lineCount = 1 + Math.floor(rand() * 3);
    const lines = Array.from({ length: lineCount }, () => {
      const p = PRODUCTS[Math.floor(rand() * PRODUCTS.length)];
      return { sku: p.sku, qty: 1 + Math.floor(rand() * 12), unitCents: p.priceCents };
    });
    const r = rand();
    const status: OrderStatus =
      daysAgo <= 2 ? "processing" : daysAgo <= 6 ? "shipped" : r < 0.07 ? "cancelled" : "delivered";
    orders.push({ id, customerId: customer.id, createdAt, status, lines });
    if (status !== "cancelled" && status !== "processing") {
      const amountCents = lines.reduce((s, l) => s + l.qty * l.unitCents, 0);
      const dueAt = new Date(createdAt.getTime() + 30 * DAY);
      const paid = rand() < 0.6 && daysAgo > 10;
      invoices.push({
        id: `INV-${id}`, orderId: id, customerId: customer.id, issuedAt: createdAt, dueAt, amountCents,
        paidAt: paid ? new Date(createdAt.getTime() + 12 * DAY) : null,
      });
    }
  }
  return { products: PRODUCTS, customers: CUSTOMERS, orders, invoices };
}
```

`lib/format.ts`:
```ts
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
export const formatMoney = (cents: number) => usd.format(cents / 100);
export const formatDate = (d: Date) => d.toISOString().slice(0, 10);
```

- [ ] **Step 3: Write the failing tests**

`tests/erp.test.ts`:
```ts
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
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npx vitest run tests/erp.test.ts`
Expected: FAIL, `Cannot find module '@/lib/erp'`.

- [ ] **Step 5: Implement `lib/erp.ts`**

```ts
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
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/erp.test.ts`
Expected: PASS (all). If "at least 3 overdue invoices" fails, change only the PRNG seed in `getDataset` (42) until it passes, and note the new seed in the commit message.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: fictional distributor dataset and ERP queries"
```

---

### Task 2: Auth keys and signed approvals

**Files:**
- Create: `lib/auth.ts`, `lib/approval.ts`
- Test: `tests/auth.test.ts`, `tests/approval.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces:
  - `verifyKey(req: Request, bearerToken?: string): AuthInfo | undefined` (AuthInfo from `@modelcontextprotocol/server`; shape `{ token: string; clientId: string; scopes: string[] }`)
  - `type FollowUpTask = { customerId: string; customerName: string; note: string; dueDate: string; requestedBy: string }`
  - `signApproval(task: FollowUpTask, secret: string, now?: Date): string`
  - `verifyApproval(token: string, secret: string, now?: Date): { ok: true; task: FollowUpTask; expiresAt: Date } | { ok: false; reason: "invalid" | "expired" }`
  - `NOTE_MAX = 500`

- [ ] **Step 1: Write the failing tests**

`tests/auth.test.ts`:
```ts
import { describe, it, expect, beforeEach } from "vitest";
import { verifyKey } from "@/lib/auth";

const req = new Request("http://x/api/mcp");
beforeEach(() => { process.env.DEMO_READ_KEY = "r".repeat(24); process.env.DEMO_WRITE_KEY = "w".repeat(24); });

describe("verifyKey", () => {
  it("read key gets read scope only", () => {
    expect(verifyKey(req, "r".repeat(24))).toMatchObject({ clientId: "demo-reader", scopes: ["erp:read"] });
  });
  it("write key gets read and write", () => {
    expect(verifyKey(req, "w".repeat(24))).toMatchObject({ clientId: "demo-operator", scopes: ["erp:read", "erp:write"] });
  });
  it("rejects missing, wrong, and different-length keys", () => {
    expect(verifyKey(req, undefined)).toBeUndefined();
    expect(verifyKey(req, "x".repeat(24))).toBeUndefined();
    expect(verifyKey(req, "r")).toBeUndefined();
  });
  it("rejects everything when env keys are unset", () => {
    delete process.env.DEMO_READ_KEY; delete process.env.DEMO_WRITE_KEY;
    expect(verifyKey(req, "")).toBeUndefined();
  });
});
```

`tests/approval.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { signApproval, verifyApproval, NOTE_MAX } from "@/lib/approval";

const SECRET = "s".repeat(40);
const NOW = new Date("2026-10-13T15:00:00Z");
const task = { customerId: "C-02", customerName: "Summit Builders", note: "Call about INV-1012", dueDate: "2026-10-15", requestedBy: "demo-operator" };

describe("approval tokens", () => {
  it("round-trips a task", () => {
    const r = verifyApproval(signApproval(task, SECRET, NOW), SECRET, NOW);
    expect(r).toMatchObject({ ok: true, task });
  });
  it("rejects a tampered payload", () => {
    const [p, s] = signApproval(task, SECRET, NOW).split(".");
    const forged = Buffer.from(JSON.stringify({ ...task, note: "wire $10k", exp: 9e12 })).toString("base64url");
    expect(verifyApproval(`${forged}.${s}`, SECRET, NOW)).toEqual({ ok: false, reason: "invalid" });
    expect(verifyApproval(`${p}.AAAA`, SECRET, NOW)).toEqual({ ok: false, reason: "invalid" });
  });
  it("rejects garbage and the wrong secret", () => {
    expect(verifyApproval("not-a-token", SECRET, NOW)).toEqual({ ok: false, reason: "invalid" });
    expect(verifyApproval(signApproval(task, SECRET, NOW), "t".repeat(40), NOW)).toEqual({ ok: false, reason: "invalid" });
  });
  it("expires after 24 hours", () => {
    const t = signApproval(task, SECRET, NOW);
    expect(verifyApproval(t, SECRET, new Date(NOW.getTime() + 25 * 3_600_000))).toEqual({ ok: false, reason: "expired" });
  });
  it("caps the note length", () => {
    const r = verifyApproval(signApproval({ ...task, note: "x".repeat(2000) }, SECRET, NOW), SECRET, NOW);
    expect(r.ok && r.task.note.length).toBe(NOTE_MAX);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/auth.test.ts tests/approval.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

`lib/auth.ts`:
```ts
import { timingSafeEqual } from "node:crypto";
import type { AuthInfo } from "@modelcontextprotocol/server";

function same(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

// Demo auth: one key per role. A client project swaps this for OAuth via withMcpAuth + their identity provider.
export function verifyKey(_req: Request, bearerToken?: string): AuthInfo | undefined {
  const read = process.env.DEMO_READ_KEY, write = process.env.DEMO_WRITE_KEY;
  if (!bearerToken) return undefined;
  if (write && same(bearerToken, write)) return { token: bearerToken, clientId: "demo-operator", scopes: ["erp:read", "erp:write"] };
  if (read && same(bearerToken, read)) return { token: bearerToken, clientId: "demo-reader", scopes: ["erp:read"] };
  return undefined;
}
```

If `AuthInfo` is not exported from `@modelcontextprotocol/server`, import it from where `mcp-handler`'s `index.d.ts` imports it (`grep -n "AuthInfo" node_modules/mcp-handler/dist/index.d.ts`), and use that path.

`lib/approval.ts`:
```ts
import { createHmac, timingSafeEqual } from "node:crypto";

export const NOTE_MAX = 500;
const TTL_MS = 24 * 3_600_000;
export type FollowUpTask = { customerId: string; customerName: string; note: string; dueDate: string; requestedBy: string };

const sig = (payload: string, secret: string) => createHmac("sha256", secret).update(payload).digest("base64url");

export function signApproval(task: FollowUpTask, secret: string, now = new Date()): string {
  const payload = Buffer.from(JSON.stringify({ ...task, note: task.note.slice(0, NOTE_MAX), exp: now.getTime() + TTL_MS })).toString("base64url");
  return `${payload}.${sig(payload, secret)}`;
}

export function verifyApproval(token: string, secret: string, now = new Date()):
  { ok: true; task: FollowUpTask; expiresAt: Date } | { ok: false; reason: "invalid" | "expired" } {
  const [payload, s] = token.split(".");
  if (!payload || !s) return { ok: false, reason: "invalid" };
  const expected = Buffer.from(sig(payload, secret)), given = Buffer.from(s);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return { ok: false, reason: "invalid" };
  let data: FollowUpTask & { exp: number };
  try { data = JSON.parse(Buffer.from(payload, "base64url").toString()); } catch { return { ok: false, reason: "invalid" }; }
  if (typeof data.exp !== "number" || now.getTime() > data.exp) return { ok: false, reason: "expired" };
  const { exp, ...task } = data;
  return { ok: true, task: { ...task, note: String(task.note).slice(0, NOTE_MAX) }, expiresAt: new Date(exp) };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/auth.test.ts tests/approval.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: per-role demo keys and HMAC-signed approval links"
```

---

### Task 3: MCP endpoint with 5 tools

**Files:**
- Create: `app/api/mcp/route.ts`
- Test: `tests/mcp.test.ts`

**Interfaces:**
- Consumes: `findOrder`, `listUnpaidInvoices`, `listLowStock`, `salesSummary` (Task 1); `formatMoney`, `formatDate` (Task 1); `verifyKey`, `signApproval`, `NOTE_MAX` (Task 2); `CUSTOMERS` (Task 1).
- Produces: `GET`, `POST` handlers at `/api/mcp`. Tool names exactly: `find_order`, `list_unpaid_invoices`, `list_low_stock`, `sales_summary`, `request_follow_up_task`.

- [ ] **Step 1: Write the failing tests**

`tests/mcp.test.ts`:
```ts
import { describe, it, expect, beforeAll } from "vitest";

const READ = "r".repeat(24), WRITE = "w".repeat(24);
beforeAll(() => {
  process.env.DEMO_READ_KEY = READ; process.env.DEMO_WRITE_KEY = WRITE;
  process.env.APPROVAL_SECRET = "s".repeat(40); process.env.PUBLIC_BASE_URL = "https://demo.test";
});

let id = 0;
async function rpc(method: string, params: unknown, key?: string) {
  const { POST } = await import("@/app/api/mcp/route");
  const res = await POST(new Request("https://demo.test/api/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": "2025-06-18",
      ...(key ? { authorization: `Bearer ${key}` } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
  }));
  const text = await res.text();
  const json = text.startsWith("{") ? JSON.parse(text) : JSON.parse(text.split("\n").find((l) => l.startsWith("data:"))!.slice(5));
  return { status: res.status, json };
}
const call = (name: string, args: object, key = READ) => rpc("tools/call", { name, arguments: args }, key);
const textOf = (r: { json: any }) => r.json.result.content.map((c: any) => c.text).join("\n");

describe("auth", () => {
  it("401 without a key", async () => {
    expect((await rpc("tools/list", {})).status).toBe(401);
  });
  it("401 with a wrong key", async () => {
    expect((await rpc("tools/list", {}, "nope")).status).toBe(401);
  });
});

describe("tools", () => {
  it("lists exactly the 5 tools", async () => {
    const r = await rpc("tools/list", {}, READ);
    expect(r.json.result.tools.map((t: any) => t.name).sort()).toEqual(
      ["find_order", "list_low_stock", "list_unpaid_invoices", "request_follow_up_task", "sales_summary"]);
  });
  it("find_order returns order 1042", async () => {
    expect(textOf(await call("find_order", { orderId: 1042 }))).toContain("Order 1042");
  });
  it("find_order on unknown id is a plain not-found result", async () => {
    const r = await call("find_order", { orderId: 9999 });
    expect(textOf(r)).toBe("Order 9999 not found.");
    expect(r.json.result.isError).toBeFalsy();
  });
  it("list_unpaid_invoices and list_low_stock answer", async () => {
    expect(textOf(await call("list_unpaid_invoices", { overdueOnly: true }))).toMatch(/overdue/i);
    expect(textOf(await call("list_low_stock", {}))).toContain("Hard hat");
  });
  it("sales_summary validates the range", async () => {
    expect(textOf(await call("sales_summary", { from: "2026-10-10", to: "2026-10-01" }))).toContain("must be on or before");
  });
  it("read key cannot request a follow-up task", async () => {
    const r = await call("request_follow_up_task", { customerId: "C-02", note: "Chase invoice", dueDate: "2026-10-20" });
    expect(r.json.result.isError).toBe(true);
    expect(textOf(r)).toContain("This key is read-only");
    expect(textOf(r)).not.toContain("/approve?t=");
  });
  it("write key gets an approval link, nothing is written", async () => {
    const r = await call("request_follow_up_task", { customerId: "C-02", note: "Chase invoice", dueDate: "2026-10-20" }, WRITE);
    expect(textOf(r)).toContain("https://demo.test/approve?t=");
    expect(textOf(r)).toContain("Not executed yet");
  });
  it("unknown customer is rejected", async () => {
    expect(textOf(await call("request_follow_up_task", { customerId: "C-99", note: "x", dueDate: "2026-10-20" }, WRITE))).toContain("Customer C-99 not found");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/mcp.test.ts`
Expected: FAIL, route module not found.

- [ ] **Step 3: Implement `app/api/mcp/route.ts`**

```ts
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { z } from "zod";
import { findOrder, listUnpaidInvoices, listLowStock, salesSummary } from "@/lib/erp";
import { CUSTOMERS } from "@/lib/data";
import { formatMoney, formatDate } from "@/lib/format";
import { verifyKey } from "@/lib/auth";
import { signApproval, NOTE_MAX } from "@/lib/approval";

type Ctx = { http?: { authInfo?: { clientId?: string; scopes?: string[] } } };
const text = (t: string, isError = false) => ({ content: [{ type: "text" as const, text: t }], ...(isError ? { isError: true } : {}) });

// One structured line per tool call: in a client project this feeds their log store / audit trail.
function logged<A>(tool: string, fn: (args: A, ctx: Ctx) => ReturnType<typeof text>) {
  return async (args: A, ctx: Ctx) => {
    const t0 = Date.now();
    const result = fn(args, ctx);
    console.log(JSON.stringify({ type: "mcp_tool_call", tool, client: ctx?.http?.authInfo?.clientId ?? "unknown", args, isError: !!result.isError, ms: Date.now() - t0 }));
    return result;
  };
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

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
    description: "Order count, revenue, top 3 customers and top 3 products between two dates (inclusive, max 366 days).",
    inputSchema: z.object({ from: isoDate, to: isoDate }),
    annotations: { readOnlyHint: true },
  }, logged("sales_summary", ({ from, to }: { from: string; to: string }) => {
    const r = salesSummary(new Date(`${from}T00:00:00Z`), new Date(`${to}T00:00:00Z`));
    if (!r.ok) return text(r.error, true);
    return text([
      `Sales ${from} to ${to}: ${r.orderCount} order(s), ${formatMoney(r.revenueCents)} revenue.`,
      `Top customers: ${r.topCustomers.map((c) => `${c.name} (${formatMoney(c.revenueCents)})`).join(", ") || "none"}`,
      `Top products: ${r.topProducts.map((p) => `${p.name} (${p.qty} units)`).join(", ") || "none"}`,
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
    const customer = CUSTOMERS.find((c) => c.id === customerId);
    if (!customer) return text(`Customer ${customerId} not found.`, true);
    const token = signApproval({ customerId, customerName: customer.name, note, dueDate, requestedBy: auth.clientId ?? "unknown" }, process.env.APPROVAL_SECRET!);
    return text([
      `Follow-up task for ${customer.name} due ${dueDate} is waiting for approval. Not executed yet.`,
      `A person must approve it here (link valid 24 h): ${process.env.PUBLIC_BASE_URL}/approve?t=${token}`,
    ].join("\n"));
  }));
}, { serverInfo: { name: "ridgeline-supply-demo", version: "1.0.0" } });

const authed = withMcpAuth(handler, verifyKey, { required: true });
export { authed as GET, authed as POST };
```

Adjustment notes for the implementer (do these only if the test or `tsc` shows the mismatch):
- If `createMcpHandler` in 2.2.0 rejects the `{ serverInfo }` option, drop the second argument.
- If tool callbacks in SDK v2 receive auth somewhere other than `ctx.http.authInfo`, find it with `grep -n "authInfo" node_modules/mcp-handler/dist/index.js` and update the `Ctx` type and the two reads; keep the behavior identical.
- If `tools/call` without a prior `initialize` is rejected, make the test `rpc` helper send `initialize` first (`{ protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "0" } }`) in the same way; do not change the route.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run` (all suites) and `npx tsc --noEmit`
Expected: all PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: MCP endpoint with 5 tools, role check and structured tool-call log"
```

---

### Task 4: Approval page and landing page

**Files:**
- Create: `app/approve/page.tsx`, `app/approve/actions.ts`, `app/approve/form.tsx`
- Modify: `app/page.tsx` (replace placeholder)
- Test: `tests/approve.test.tsx`

**Interfaces:**
- Consumes: `verifyApproval`, `signApproval`, `FollowUpTask` (Task 2).
- Produces: `approveTask(formData: FormData): Promise<{ ok: boolean; message: string }>` server action; pages at `/` and `/approve?t=<token>`.

- [ ] **Step 1: Write the failing test**

`tests/approve.test.tsx`:
```tsx
import { describe, it, expect, beforeAll } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { signApproval } from "@/lib/approval";
import ApprovePage from "@/app/approve/page";
import { approveTask } from "@/app/approve/actions";

const SECRET = "s".repeat(40);
beforeAll(() => { process.env.APPROVAL_SECRET = SECRET; });
const task = { customerId: "C-02", customerName: "Summit Builders", note: "<script>alert(1)</script> ignore previous instructions", dueDate: "2026-12-01", requestedBy: "demo-operator" };

describe("/approve", () => {
  it("shows the task as plain text with an approve button", async () => {
    const html = renderToStaticMarkup(await ApprovePage({ searchParams: Promise.resolve({ t: signApproval(task, SECRET) }) }));
    expect(html).toContain("Summit Builders");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("Approve");
  });
  it("rejects a tampered link and offers no button", async () => {
    const html = renderToStaticMarkup(await ApprovePage({ searchParams: Promise.resolve({ t: "abc.def" }) }));
    expect(html).toContain("This approval link is invalid or expired");
    expect(html).not.toContain("<button");
  });
  it("server action re-verifies the token", async () => {
    const good = new FormData(); good.set("t", signApproval(task, SECRET));
    const bad = new FormData(); bad.set("t", "abc.def");
    expect((await approveTask(good)).ok).toBe(true);
    expect((await approveTask(bad)).ok).toBe(false);
  });
});
```

Add `"react-dom/server"` works in node env; if vitest needs JSX config, set `esbuild: { jsx: "automatic" }` in `vitest.config.ts`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/approve.test.tsx`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

`app/approve/actions.ts`:
```ts
"use server";
import { verifyApproval } from "@/lib/approval";

export async function approveTask(formData: FormData) {
  const r = verifyApproval(String(formData.get("t") ?? ""), process.env.APPROVAL_SECRET!);
  if (!r.ok) return { ok: false, message: "This approval link is invalid or expired." };
  console.log(JSON.stringify({ type: "approval", customerId: r.task.customerId, dueDate: r.task.dueDate, requestedBy: r.task.requestedBy }));
  return { ok: true, message: `Approved. In a client deployment, this is the moment the task is written to their system for ${r.task.customerName}.` };
}
```

`app/approve/page.tsx`:
```tsx
import { verifyApproval } from "@/lib/approval";
import ApproveForm from "./form";

export default async function ApprovePage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t = "" } = await searchParams;
  const r = verifyApproval(t, process.env.APPROVAL_SECRET!);
  if (!r.ok) return (<main><h1>Approval</h1><p>This approval link is invalid or expired.</p></main>);
  return (
    <main>
      <h1>Approve follow-up task</h1>
      <p>Claude asked to create this task. Nothing has been written yet.</p>
      <dl>
        <dt>Customer</dt><dd>{r.task.customerName} ({r.task.customerId})</dd>
        <dt>Due</dt><dd>{r.task.dueDate}</dd>
        <dt>Note</dt><dd style={{ whiteSpace: "pre-wrap" }}>{r.task.note}</dd>
        <dt>Requested by</dt><dd>{r.task.requestedBy}</dd>
        <dt>Link expires</dt><dd>{r.expiresAt.toISOString().replace("T", " ").slice(0, 16)} UTC</dd>
      </dl>
      <ApproveForm token={t} />
      <p><small>Demo data, fictional company.</small></p>
    </main>
  );
}
```

`app/approve/form.tsx` (client component so the result shows inline):
```tsx
"use client";
import { useActionState } from "react";
import { approveTask } from "./actions";

export default function ApproveForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(async (_: unknown, fd: FormData) => approveTask(fd), null as null | { ok: boolean; message: string });
  if (state) return <p role="status">{state.message}</p>;
  return (
    <form action={action}>
      <input type="hidden" name="t" value={token} />
      <button type="submit" disabled={pending}>Approve</button>
    </form>
  );
}
```

`app/page.tsx`:
```tsx
const REPO = "https://github.com/martin-minghetti/ridgeline-mcp";
export default function Home() {
  const url = `${process.env.PUBLIC_BASE_URL ?? ""}/api/mcp`;
  return (
    <main>
      <h1>Ridgeline Supply · MCP demo</h1>
      <p>An MCP server that connects Claude to the back office of a fictional distributor. Ask things like
        “What&apos;s the status of order 1042?”, “Which invoices are overdue?”, “What do we need to reorder?”
        or “How did sales go this month?”. Write actions need a human approval first.</p>
      <h2>Connect</h2>
      <p>Server URL: <code>{url}</code></p>
      <p>Send <code>Authorization: Bearer &lt;key&gt;</code>. Keys and setup steps for Claude and Claude Code are in the <a href={REPO}>README</a>.</p>
      <h2>Tools</h2>
      <ul>
        <li><code>find_order</code>: one order with lines, total and invoice status</li>
        <li><code>list_unpaid_invoices</code>: unpaid or overdue invoices, most overdue first</li>
        <li><code>list_low_stock</code>: products at or below reorder point</li>
        <li><code>sales_summary</code>: revenue and top customers/products for a date range</li>
        <li><code>request_follow_up_task</code>: creates an approval link, never writes on its own</li>
      </ul>
      <p><small>Demo data, fictional company. Source: <a href={REPO}>GitHub</a>.</small></p>
    </main>
  );
}
```

- [ ] **Step 4: Run tests and build**

Run: `npx vitest run && npx tsc --noEmit && npx next build`
Expected: all tests PASS, build succeeds.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: approval page with signed links and landing page"
```

---

### Task 5: README, deploy, GitHub and live check

**Files:**
- Create: `README.md`, `LICENSE` (MIT, "Copyright (c) 2026 Martin Minghetti")

**Interfaces:**
- Consumes: everything above. Produces: public repo, production URL, live smoke test result.

- [ ] **Step 1: Generate keys and deploy to Vercel**

```bash
cd ~/Projects/ridgeline-mcp
READ=$(openssl rand -hex 16); WRITE=$(openssl rand -hex 16); SECRET=$(openssl rand -hex 32)
vercel link --yes --project ridgeline-mcp
for e in production preview; do
  printf %s "$READ"   | vercel env add DEMO_READ_KEY $e
  printf %s "$WRITE"  | vercel env add DEMO_WRITE_KEY $e
  printf %s "$SECRET" | vercel env add APPROVAL_SECRET $e
done
vercel deploy --prod --yes
```

Then set `PUBLIC_BASE_URL` to the production alias printed by the deploy (expected `https://ridgeline-mcp.vercel.app`; if taken, use the alias Vercel printed), redeploy with `vercel deploy --prod --yes`. Save `READ` and `WRITE` to the vault file `private/ridgeline-mcp-keys.private.md` (never commit them to the repo). Confirm Deployment Protection is off for production (`vercel project inspect ridgeline-mcp` / dashboard) so Claude can reach it.

- [ ] **Step 2: Live smoke test (real endpoint, real keys)**

```bash
BASE=https://ridgeline-mcp.vercel.app
curl -s -o /dev/null -w "%{http_code}\n" -X POST $BASE/api/mcp -H 'content-type: application/json' -d '{}'   # expect 401
curl -s -X POST $BASE/api/mcp -H "authorization: Bearer $READ" -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' -H 'mcp-protocol-version: 2025-06-18' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"find_order","arguments":{"orderId":1042}}}'  # expect "Order 1042"
claude mcp add --transport http ridgeline-demo $BASE/api/mcp --header "Authorization: Bearer $WRITE"
claude -p "Using the ridgeline-demo tools: which invoices are overdue, what should we reorder, and request a follow-up task for the most overdue customer due in 3 days." --allowedTools "mcp__ridgeline-demo__*"
```

Expected: 401, then order text, then a Claude answer that cites overdue invoices, low stock and an `/approve?t=` link. Open that link with `agent-browser open <link>`, click Approve, `agent-browser screenshot --full` → confirm "Approved." Afterwards remove the test connector: `claude mcp remove ridgeline-demo`.

- [ ] **Step 3: Write README.md**

Sections, in this order (English, no em dashes in prose, no sales pitch, no Upwork link):
1. Title `Ridgeline Supply · MCP demo` + one line: "An MCP server that connects Claude to a (fictional) distributor's back office: orders, invoices, stock and sales, with human approval before any write."
2. Badge-free "Try it" block: server URL, public read key (the `READ` value; the write key is NOT published, it says "operator key on request"), and steps: Claude (Settings → Connectors → Add custom connector → URL → Advanced: request header `Authorization: Bearer <key>`), Claude Code (`claude mcp add --transport http ...`). Note: "On Claude's Free plan you can add one custom connector."
3. "Example questions" (the four from the landing page) and a screenshot `docs/claude-answer.png` taken in Step 2 (Claude Code output or the approval page; use `agent-browser screenshot`).
4. "Tools" table: name, what it does, read/write.
5. "How it's built": Next.js route + `mcp-handler`; `lib/erp.ts` stands in for the client's system; data is fixed and dates move with the clock.
6. "Safety": bounded results (max 20 rows), validated inputs, read and write keys, writes go through a signed 24 h approval link, one structured log line per tool call, no raw SQL.
7. "Adapting it to a real system": replace the functions in `lib/erp.ts` with calls to your API; swap `verifyKey` for OAuth with `withMcpAuth` and your identity provider; send the log line to your log store.
8. "Running cost": Vercel Hobby/Pro function invocations only; no database, no LLM calls on the server (the user's Claude does the reasoning).
9. "Compatibility": tested with Claude (custom connector) and Claude Code. Uses standard MCP over Streamable HTTP; ChatGPT supports custom MCP apps on Business/Enterprise/Edu (not tested here).
10. "Run locally": `npm install`, copy `.env.example` to `.env.local`, `npm run dev`, `npm test`.
11. "Demo data, fictional company. Concept project." + License MIT.

- [ ] **Step 4: Create the public GitHub repo, push, release**

```bash
git add -A && git commit -m "docs: README with setup, safety and adaptation notes"
gh repo create martin-minghetti/ridgeline-mcp --public --source . --push --description "Demo MCP server: Claude connected to a fictional distributor's back office, with human approval before writes."
gh release create v1.0.0 --title "v1.0.0" --notes "First public demo: 5 tools, per-role keys, signed approval links."
vercel git connect --yes || true
```

- [ ] **Step 5: Final verification**

Run: `npm test` (all pass), `curl` the landing page (200), the approval link from Step 2 (200), `/api/mcp` without key (401). Record results in the vault note `projects/upwork/2026-10-13-mcp-que-busca-la-gente.md` under "Demo publicado" with the URLs.
