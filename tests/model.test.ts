import test from "node:test";
import assert from "node:assert/strict";
import { cacheIsFresh, documentSchema, formatMoney, initialDocument, makeSnapshot, MAX_OFFLINE_MS, menuRows, mirrorAll, pricePence, promotionIsActive, resolveScreen } from "../src/lib/model";
import { seededDocument } from "../src/lib/seed";
import { fixture } from "./fixtures";
test("seed preserves 140 items, 314 exact price variants and 13 categories as drafts", () => {
  const doc = seededDocument();
  assert.equal(doc.items.length, 140); assert.equal(doc.categories.length, 13);
  assert.equal(doc.items.reduce((sum, item) => sum + item.variants.length, 0), 314);
  assert.ok(doc.items.every(item => item.status === "draft")); assert.ok(doc.screens.every(screen => !screen.enabled));
  assert.equal(doc.items.find(item => item.name === "Cheese Burger")?.variants[1].pricePence, 710);
  assert.deepEqual(doc.items.find(item => item.name === "Saffron Chicken Breast Bbqd")?.variants.map(v => v.pricePence), [650, 900]);
});
test("exactly six valid, unique screens are required", () => {
  const doc = initialDocument(); assert.equal(documentSchema.safeParse(doc).success, true);
  assert.equal(documentSchema.safeParse({ ...doc, screens: doc.screens.slice(0, 5) }).success, false);
  doc.screens[5].id = 1; assert.equal(documentSchema.safeParse(doc).success, false);
});
test("self mirrors and indirect cycles are rejected", () => {
  const doc = initialDocument(); doc.screens[0].mirrorOf = 1;
  assert.equal(documentSchema.safeParse(doc).success, false);
  doc.screens[0].mirrorOf = 2; doc.screens[1].mirrorOf = 3; doc.screens[2].mirrorOf = 1;
  assert.equal(documentSchema.safeParse(doc).success, false);
});
test("mirroring all screens flattens the selected source without a cycle", () => {
  const { document } = fixture(); document.screens[0].mirrorOf = 2;
  const mirrored = mirrorAll(document, 1);
  assert.equal(mirrored.screens[0].mirrorOf, null);
  assert.ok(mirrored.screens.slice(1).every(screen => screen.mirrorOf === 1));
  assert.equal(resolveScreen(mirrored, 6).title, "Screen 2 menu");
  mirrored.screens[0].enabled = false; assert.equal(resolveScreen(mirrored, 6).enabled, false);
});
test("draft and sold-out products never enter a display snapshot", () => {
  const saved = fixture(); saved.document.items[0].status = "draft"; saved.document.items[1].available = false;
  const snapshot = makeSnapshot(saved, 1); assert.equal(snapshot.items.length, 6);
  assert.ok(snapshot.items.every(item => item.status === "published" && item.available));
  saved.document.screens[0].enabled = false; assert.equal(makeSnapshot(saved, 1).items.length, 0);
});
test("category filtering and every price variant are preserved", () => {
  const saved = fixture(); saved.document.screens[0].categoryIds = ["category-2"];
  assert.equal(makeSnapshot(saved, 1).items.length, 0);
  const doc = seededDocument(); doc.items.forEach(item => { item.status = "published"; }); doc.screens[0].enabled = true;
  assert.equal(menuRows(makeSnapshot({ document: doc, revision: 1 }, 1)).length, 314);
});
test("stale and future-dated cached prices fail closed", () => {
  const cache = { snapshot: makeSnapshot(fixture(), 1), validatedAt: 10_000 };
  assert.equal(cacheIsFresh(cache, 10_001), true);
  assert.equal(cacheIsFresh(cache, 10_000 + MAX_OFFLINE_MS), false);
  assert.equal(cacheIsFresh(cache, 9_999), false); assert.equal(cacheIsFresh(null, 10_000), false);
});
test("promotions require an expiry and disappear at the exact boundary", () => {
  const doc = initialDocument(); const screen = doc.screens[0]; screen.promotion = "Test promotion";
  assert.equal(documentSchema.safeParse(doc).success, false);
  screen.promotionEndsAt = "2026-10-10T00:00:00.000Z";
  assert.equal(promotionIsActive(screen, Date.parse(screen.promotionEndsAt) - 1), true);
  assert.equal(promotionIsActive(screen, Date.parse(screen.promotionEndsAt)), false);
});
test("money parsing uses integer pence and rejects ambiguous values", () => {
  assert.equal(pricePence("6.25"), 625); assert.equal(pricePence("0.1"), 10);
  assert.equal(pricePence("1000"), 100000); assert.equal(formatMoney(625), "£6.25");
  for (const value of ["", "1e3", "-1", "1.005", "£6", "1,000", "1001", ".5"]) assert.equal(pricePence(value), null);
});
test("unknown fields, orphan categories, duplicate variants and unsafe media are rejected", () => {
  const { document } = fixture();
  assert.equal(documentSchema.safeParse({ ...document, adminPassword: "not-allowed" }).success, false);
  document.items[0].categoryId = "missing"; assert.equal(documentSchema.safeParse(document).success, false);
  document.items[0].categoryId = "category-1"; document.items[0].variants.push({ ...document.items[0].variants[0] });
  assert.equal(documentSchema.safeParse(document).success, false);
  document.items[0].variants.pop(); document.items[0].imageId = "javascript:alert(1)";
  assert.equal(documentSchema.safeParse(document).success, false);
});
