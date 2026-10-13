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
