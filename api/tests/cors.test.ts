import { test } from "node:test";
import assert from "node:assert/strict";
import { isAllowedCorsOrigin, parseCorsOrigins } from "../src/cors.js";

test("CORS allows missing Origin (non-browser / mini-program)", () => {
  assert.equal(isAllowedCorsOrigin(undefined), true);
  assert.equal(isAllowedCorsOrigin(null), true);
  assert.equal(isAllowedCorsOrigin(""), true);
});

test("CORS allows localhost and loopback for Admin Vite", () => {
  assert.equal(isAllowedCorsOrigin("http://localhost:5173"), true);
  assert.equal(isAllowedCorsOrigin("http://localhost:4173"), true);
  assert.equal(isAllowedCorsOrigin("http://127.0.0.1:3000"), true);
  assert.equal(isAllowedCorsOrigin("https://localhost"), true);
  assert.equal(isAllowedCorsOrigin("http://[::1]:5173"), true);
});

test("CORS allows Railway public Admin hosts", () => {
  assert.equal(isAllowedCorsOrigin("https://admin-production-xxxx.up.railway.app"), true);
  assert.equal(isAllowedCorsOrigin("https://foo.up.railway.app"), true);
});

test("CORS denies unrelated origins unless listed in CORS_ORIGINS", () => {
  assert.equal(isAllowedCorsOrigin("https://evil.example"), false);
  assert.equal(isAllowedCorsOrigin("https://up.railway.app.evil.com"), false);
  assert.equal(isAllowedCorsOrigin("https://notrailway.app"), false);
  assert.equal(isAllowedCorsOrigin("ftp://localhost"), false);
  assert.equal(isAllowedCorsOrigin("not-a-url"), false);
  assert.equal(
    isAllowedCorsOrigin("https://ops.example.com", ["https://ops.example.com"]),
    true,
  );
  assert.equal(isAllowedCorsOrigin("https://ops.example.com", ["https://other.example"]), false);
});

test("parseCorsOrigins splits comma-separated extras", () => {
  assert.deepEqual(parseCorsOrigins(" https://a.example,https://b.example "), [
    "https://a.example",
    "https://b.example",
  ]);
  assert.deepEqual(parseCorsOrigins(""), []);
  assert.deepEqual(parseCorsOrigins(undefined), []);
});
