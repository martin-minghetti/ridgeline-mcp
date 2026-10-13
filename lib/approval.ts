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
