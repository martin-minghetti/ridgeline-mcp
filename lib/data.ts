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
