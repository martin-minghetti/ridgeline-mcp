"use server";
import { verifyApproval } from "@/lib/approval";
import { approvalSecret } from "@/lib/secret";

const INVALID = { ok: false, message: "This approval link is invalid or expired." };

export async function approveTask(formData: FormData): Promise<{ ok: boolean; message: string }> {
  const secret = approvalSecret();
  if (!secret) return INVALID;
  const r = verifyApproval(String(formData.get("t") ?? ""), secret);
  if (!r.ok) return INVALID;
  console.log(JSON.stringify({ type: "approval", customerId: r.task.customerId, dueDate: r.task.dueDate, requestedBy: r.task.requestedBy }));
  return { ok: true, message: `Approved. In a client deployment, this is the moment the task is written to their system for ${r.task.customerName}.` };
}
