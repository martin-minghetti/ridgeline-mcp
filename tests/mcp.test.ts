import { describe, it, expect, beforeAll, vi } from "vitest";

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
  it("fails closed when APPROVAL_SECRET is missing or short", async () => {
    const saved = process.env.APPROVAL_SECRET;
    try {
      for (const bad of [undefined, "short"]) {
        if (bad === undefined) delete process.env.APPROVAL_SECRET; else process.env.APPROVAL_SECRET = bad;
        const r = await call("request_follow_up_task", { customerId: "C-02", note: "x", dueDate: "2026-10-20" }, WRITE);
        expect(r.json.result.isError).toBe(true);
        expect(textOf(r)).toBe("Server is not configured for approvals.");
        expect(textOf(r)).not.toContain("/approve?t=");
      }
    } finally { if (saved === undefined) delete process.env.APPROVAL_SECRET; else process.env.APPROVAL_SECRET = saved; }
  });
  it("fails closed when PUBLIC_BASE_URL is unset", async () => {
    const saved = process.env.PUBLIC_BASE_URL;
    try {
      delete process.env.PUBLIC_BASE_URL;
      const r = await call("request_follow_up_task", { customerId: "C-02", note: "x", dueDate: "2026-10-20" }, WRITE);
      expect(r.json.result.isError).toBe(true);
      expect(textOf(r)).toBe("Server is not configured for approvals.");
    } finally { if (saved === undefined) delete process.env.PUBLIC_BASE_URL; else process.env.PUBLIC_BASE_URL = saved; }
  });
  it("strips a trailing slash from PUBLIC_BASE_URL", async () => {
    const saved = process.env.PUBLIC_BASE_URL;
    try {
      process.env.PUBLIC_BASE_URL = "https://demo.test/";
      const r = await call("request_follow_up_task", { customerId: "C-02", note: "x", dueDate: "2026-10-20" }, WRITE);
      expect(textOf(r)).toContain("https://demo.test/approve?t=");
    } finally { process.env.PUBLIC_BASE_URL = saved; }
  });
  it("rejects impossible calendar dates", async () => {
    const r = await call("sales_summary", { from: "2026-02-31", to: "2026-03-05" });
    expect(r.json.result?.isError ?? true).toBe(true);
    expect(JSON.stringify(r.json)).not.toContain("revenue.");
  });
  it("log line has noteLength, not the note text", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await call("request_follow_up_task", { customerId: "C-02", note: "SECRET-NOTE-TEXT", dueDate: "2026-10-20" }, WRITE);
      const lines = spy.mock.calls.map((c) => String(c[0])).filter((l) => l.includes("mcp_tool_call"));
      expect(lines).toHaveLength(1);
      expect(lines[0]).toContain('"noteLength":16');
      expect(lines[0]).not.toContain("SECRET-NOTE-TEXT");
    } finally { spy.mockRestore(); }
  });
});
