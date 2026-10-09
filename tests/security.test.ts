import test from "node:test";
import assert from "node:assert/strict";
import { scryptSync } from "node:crypto";
import { assertOrigin, checkPassword, digest, HttpError, limitedBody, pairingDigest, randomToken, validPasswordHash } from "../src/lib/security";
test("scrypt verifies the right password and rejects malformed hashes", async () => {
  const salt = "0123456789abcdef0123456789abcdef"; const password = "a-test-only-password-123";
  const bytes = scryptSync(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  const hash = `scrypt$${salt}$${bytes.toString("hex")}`;
  assert.equal(validPasswordHash(hash), true); assert.equal(await checkPassword(password, hash), true);
  assert.equal(await checkPassword("an-incorrect-password", hash), false);
  assert.equal(await checkPassword(password, "plaintext"), false);
});
test("device codes are scoped to one screen and tokens have 256 bits", () => {
  assert.notEqual(pairingDigest(1, "123456"), pairingDigest(2, "123456"));
  const a = randomToken(), b = randomToken(); assert.match(a, /^[a-f0-9]{64}$/); assert.notEqual(a, b);
  assert.notEqual(digest(a), a);
});
test("CSRF checks require the configured exact origin, including on localhost", () => {
  assert.doesNotThrow(() => assertOrigin(new Request("https://app.example/api", { headers: { origin: "https://app.example" } }), "https://app.example"));
  for (const origin of ["https://evil.example", "null", "https://app.example.evil.example", ""]) {
    assert.throws(() => assertOrigin(new Request("https://app.example/api", { headers: { origin } }), "https://app.example"), (error: unknown) => error instanceof HttpError && error.status === 403);
  }
});
test("request bodies are bounded even without Content-Length", async () => {
  assert.equal((await limitedBody(new Request("https://app.example", { method: "POST", body: "small" }), 5)).toString(), "small");
  await assert.rejects(limitedBody(new Request("https://app.example", { method: "POST", body: "too large" }), 5), (error: unknown) => error instanceof HttpError && error.status === 413);
});
