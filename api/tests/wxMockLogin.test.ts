/**
 * Production must never enable WeChat mock solely because WX_SECRET is missing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveMockWxAuth } from "../src/config.js";

test("prod never mocks solely because appId/secret are missing", () => {
  assert.equal(
    resolveMockWxAuth({ nodeEnv: "production", appId: "wx123", secret: "" }),
    false,
  );
  assert.equal(resolveMockWxAuth({ nodeEnv: "production", appId: "", secret: "" }), false);
  assert.equal(
    resolveMockWxAuth({ nodeEnv: "production", appId: "wx123", secret: "set" }),
    false,
  );
});

test("prod mocks only when MOCK_WX_LOGIN is explicit", () => {
  assert.equal(
    resolveMockWxAuth({
      nodeEnv: "production",
      mockFlag: "1",
      appId: "",
      secret: "",
    }),
    true,
  );
});

test("non-prod mocks when credentials are missing", () => {
  assert.equal(resolveMockWxAuth({ nodeEnv: "development", appId: "", secret: "" }), true);
  assert.equal(resolveMockWxAuth({ nodeEnv: "test", appId: "wx123", secret: "" }), true);
});

test("non-prod with credentials does not mock unless flag is set", () => {
  assert.equal(
    resolveMockWxAuth({ nodeEnv: "development", appId: "wx123", secret: "set" }),
    false,
  );
  assert.equal(
    resolveMockWxAuth({
      nodeEnv: "development",
      mockFlag: "1",
      appId: "wx123",
      secret: "set",
    }),
    true,
  );
});
