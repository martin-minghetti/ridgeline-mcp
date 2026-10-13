/** Returns the approval secret, or null when missing/too short (callers fail closed). */
export function approvalSecret(): string | null {
  const s = process.env.APPROVAL_SECRET;
  return s && s.length >= 32 ? s : null;
}
