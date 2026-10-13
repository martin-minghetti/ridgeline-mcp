import { verifyApproval } from "@/lib/approval";
import { approvalSecret } from "@/lib/secret";
import ApproveForm from "./form";

export default async function ApprovePage({ searchParams }: { searchParams: Promise<{ t?: string | string[] }> }) {
  const sp = await searchParams;
  const t = typeof sp.t === "string" ? sp.t : "";
  const secret = approvalSecret();
  const r = secret ? verifyApproval(t, secret) : null;
  if (!r || !r.ok) return (<main><h1>Approval</h1><p>This approval link is invalid or expired.</p></main>);
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
      <p><small>In a real deployment this page sits behind your company login and records who approved.</small></p>
      <p><small>Demo data, fictional company.</small></p>
    </main>
  );
}
