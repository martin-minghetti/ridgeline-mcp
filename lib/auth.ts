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
