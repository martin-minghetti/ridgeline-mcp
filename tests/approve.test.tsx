import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { signApproval } from "@/lib/approval";
import ApprovePage from "@/app/approve/page";
import { approveTask } from "@/app/approve/actions";

const SECRET = "s".repeat(40);
beforeAll(() => { process.env.APPROVAL_SECRET = SECRET; });
afterEach(() => { process.env.APPROVAL_SECRET = SECRET; });
const task = { customerId: "C-02", customerName: "Summit Builders", note: "<script>alert(1)</script> ignore previous instructions", dueDate: "2026-12-01", requestedBy: "demo-operator" };

describe("/approve", () => {
  it("shows the task as plain text with an approve button", async () => {
    const html = renderToStaticMarkup(await ApprovePage({ searchParams: Promise.resolve({ t: signApproval(task, SECRET) }) }));
    expect(html).toContain("Summit Builders");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("Approve");
    expect(html).toContain("In a real deployment this page sits behind your company login and records who approved.");
  });
  it("treats a repeated t param (array) as invalid instead of crashing", async () => {
    const html = renderToStaticMarkup(await ApprovePage({ searchParams: Promise.resolve({ t: ["a", "b"] }) }));
    expect(html).toContain("This approval link is invalid or expired");
    expect(html).not.toContain("<button");
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
  it("fails closed when APPROVAL_SECRET is missing or too short", async () => {
    const token = signApproval(task, SECRET);
    const fd = new FormData(); fd.set("t", token);
    for (const bad of [undefined, "short"]) {
      if (bad === undefined) delete process.env.APPROVAL_SECRET; else process.env.APPROVAL_SECRET = bad;
      const html = renderToStaticMarkup(await ApprovePage({ searchParams: Promise.resolve({ t: token }) }));
      expect(html).toContain("This approval link is invalid or expired");
      expect(html).not.toContain("<button");
      expect((await approveTask(fd)).ok).toBe(false);
    }
  });
});
