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
