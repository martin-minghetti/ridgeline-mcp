import { describe, it, expect, beforeEach } from "vitest";
import { verifyKey } from "@/lib/auth";

const req = new Request("http://x/api/mcp");
beforeEach(() => { process.env.DEMO_READ_KEY = "r".repeat(24); process.env.DEMO_WRITE_KEY = "w".repeat(24); });

describe("verifyKey", () => {
  it("read key gets read scope only", () => {
    expect(verifyKey(req, "r".repeat(24))).toMatchObject({ clientId: "demo-reader", scopes: ["erp:read"] });
  });
  it("write key gets read and write", () => {
    expect(verifyKey(req, "w".repeat(24))).toMatchObject({ clientId: "demo-operator", scopes: ["erp:read", "erp:write"] });
  });
  it("rejects missing, wrong, and different-length keys", () => {
    expect(verifyKey(req, undefined)).toBeUndefined();
    expect(verifyKey(req, "x".repeat(24))).toBeUndefined();
    expect(verifyKey(req, "r")).toBeUndefined();
  });
  it("rejects everything when env keys are unset", () => {
    delete process.env.DEMO_READ_KEY; delete process.env.DEMO_WRITE_KEY;
    expect(verifyKey(req, "")).toBeUndefined();
  });
});
