import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { SignageRepository } from "../src/lib/repository";
import { digest, pairingDigest } from "../src/lib/security";
import { fixture } from "./fixtures";
test("PostgreSQL persistence, races, sessions, pairing, revocation and uploads", async t => {
  const db = new PGlite();
  try {
    await db.exec(readFileSync("db/001_signage.sql", "utf8"));
    await db.query("INSERT INTO signage_document(id, document) VALUES (1, $1::jsonb)", [JSON.stringify(fixture().document)]);
    const repo = new SignageRepository(async (sql, values = []) => (await db.query<Record<string, unknown>>(sql, values)).rows);
    await t.test("two saves against one version cannot silently overwrite each other", async () => {
      const original = await repo.read(); const a = structuredClone(original.document), b = structuredClone(original.document);
      a.screens[0].title = "First editor"; b.screens[0].title = "Second editor";
      const results = await Promise.all([repo.save(1, a), repo.save(1, b)]);
      assert.equal(results.filter(Boolean).length, 1); assert.equal((await repo.read()).revision, 2);
    });
    await t.test("parameterised strings are data, not executable SQL", async () => {
      const current = await repo.read(); current.document.screens[0].title = "Menu'; DROP TABLE signage_document; --";
      await repo.save(current.revision, current.document); assert.equal((await repo.read()).document.screens[0].title, current.document.screens[0].title);
    });
    await t.test("pair codes are single-use and cannot pair another screen", async () => {
      await repo.pairingCode(1, pairingDigest(1, "123456"));
      assert.equal(await repo.pair(2, pairingDigest(2, "123456"), digest("other")), false);
      assert.equal(await repo.pair(1, pairingDigest(1, "000000"), digest("other")), false);
      assert.equal(await repo.pair(1, pairingDigest(1, "123456"), digest("device")), true);
      assert.equal(await repo.pair(1, pairingDigest(1, "123456"), digest("replay")), false);
      assert.equal(await repo.authenticateDisplay(1, digest("device"), 3), true);
      assert.equal((await repo.devices())[0].reportedRevision, 3);
    });
    await t.test("revocation rejects an existing device token", async () => {
      await repo.revoke(1); assert.equal(await repo.authenticateDisplay(1, digest("device"), 3), false);
      assert.equal((await repo.devices())[0].paired, false);
    });
    await t.test("expired pairing codes cannot be exchanged", async () => {
      await repo.pairingCode(2, pairingDigest(2, "234567"));
      await db.query("UPDATE signage_devices SET code_expires_at = now() - interval '1 second' WHERE screen_id = 2");
      assert.equal(await repo.pair(2, pairingDigest(2, "234567"), digest("device2")), false);
    });
    await t.test("sessions expire and password changes invalidate old sessions", async () => {
      await repo.createSession(digest("session"), digest("credential"));
      assert.equal(await repo.sessionExists(digest("session"), digest("credential")), true);
      assert.equal(await repo.sessionExists(digest("session"), digest("changed")), false);
      await db.query("UPDATE signage_sessions SET expires_at = now() - interval '1 second'");
      assert.equal(await repo.sessionExists(digest("session"), digest("credential")), false);
    });
    await t.test("rate limits persist across repository instances and reset after the window", async () => {
      assert.equal(await repo.allow("test-login", 2, 60), true); assert.equal(await repo.allow("test-login", 2, 60), true);
      assert.equal(await repo.allow("test-login", 2, 60), false);
      await db.query("UPDATE signage_rate_limits SET reset_at = now() - interval '1 second' WHERE key = 'test-login'");
      assert.equal(await repo.allow("test-login", 2, 60), true);
    });
    await t.test("images round-trip and unknown image IDs cannot be published", async () => {
      const id = randomUUID(); await repo.storeImage(id, Buffer.from("test-image-data"), 10, 10);
      const image = await repo.image(id); assert.equal(Buffer.from(image!.bytes, "base64").toString(), "test-image-data");
      const current = await repo.read(); current.document.items[0].imageId = randomUUID();
      await assert.rejects(repo.save(current.revision, current.document), /image no longer exists/);
      current.document.items[0].imageId = id; assert.ok(await repo.save(current.revision, current.document));
    });
  } finally { await db.close(); }
});
