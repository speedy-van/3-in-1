import { test, expect, type Page } from "@playwright/test";
import { fixture } from "../tests/fixtures";
import { makeSnapshot, MAX_OFFLINE_MS, type SavedDocument } from "../src/lib/model";
async function noHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}
test("administrator login works at 360px without overflow", async ({ page }, info) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/admin/screens"); await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
  await noHorizontalOverflow(page); await page.screenshot({ path: info.outputPath("login-360.png"), fullPage: true });
});
test("six distinct display routes render at television size", async ({ page }, info) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.route("**/api/signage/displays/*", route => {
    const id = Number(new URL(route.request().url()).pathname.split("/").pop());
    return route.fulfill({ json: makeSnapshot(fixture(), id) });
  });
  for (let id = 1; id <= 6; id++) {
    await page.goto(`/display/${id}`);
    await expect(page.getByRole("heading", { name: `Screen ${id} menu` })).toBeVisible();
    await page.getByRole("button", { name: "Hide controls" }).click(); await noHorizontalOverflow(page);
    if (id === 1) await page.screenshot({ path: info.outputPath("display-1920.png"), fullPage: true });
  }
});
test("admin edits and saves a screen without losing the other five", async ({ page }, info) => {
  let saved = fixture();
  await page.route("**/api/signage/admin", async route => {
    if (route.request().method() === "PUT") {
      const data = route.request().postDataJSON(); expect(data.expectedRevision).toBe(saved.revision);
      saved = { document: data.document, revision: saved.revision + 1 };
    }
    await route.fulfill({ json: { ...saved, devices: [] } });
  });
  await page.setViewportSize({ width: 360, height: 800 }); await page.goto("/admin/screens");
  await page.getByLabel("Screen 1 heading", { exact: true }).fill("Evening favourites");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Version 2 saved");
  expect(saved.document.screens).toHaveLength(6); expect(saved.document.screens[0].title).toBe("Evening favourites");
  await noHorizontalOverflow(page); await page.screenshot({ path: info.outputPath("admin-360.png"), fullPage: true });
});
test("price editing submitted with Enter preserves exact pence", async ({ page }) => {
  let saved = fixture();
  await page.route("**/api/signage/admin", async route => {
    if (route.request().method() === "PUT") saved = { document: route.request().postDataJSON().document, revision: 2 };
    await route.fulfill({ json: { ...saved, devices: [] } });
  });
  await page.goto("/admin/screens"); await page.getByRole("button", { name: "Menu & prices" }).click();
  const input = page.getByLabel("Price: Vegetable Pakora Standard", { exact: true });
  await input.fill("6.25"); await input.press("Enter");
  await expect(page.getByRole("status")).toContainText("Version 2 saved");
  expect(saved.document.items[0].variants[0].pricePence).toBe(625);
});
test("a version conflict keeps the unsaved edit and explains recovery", async ({ page }) => {
  await page.route("**/api/signage/admin", route => route.request().method() === "PUT"
    ? route.fulfill({ status: 409, json: { error: "Another administrator saved changes. Reload the saved version before trying again." } })
    : route.fulfill({ json: { ...fixture(), devices: [] } }));
  await page.goto("/admin/screens"); await page.getByLabel("Screen 1 heading", { exact: true }).fill("Keep my unsaved heading");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Another administrator");
  await expect(page.getByLabel("Screen 1 heading", { exact: true })).toHaveValue("Keep my unsaved heading");
});
test("mirroring all screens keeps their own enable switches", async ({ page }) => {
  let saved: SavedDocument = fixture();
  await page.route("**/api/signage/admin", async route => {
    if (route.request().method() === "PUT") saved = { document: route.request().postDataJSON().document, revision: 2 };
    await route.fulfill({ json: { ...saved, devices: [] } });
  });
  await page.goto("/admin/screens");
  await page.getByRole("button", { name: "Show this content on all six screens" }).first().click();
  await page.getByLabel("Enable screen 6", { exact: true }).uncheck();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Version 2 saved");
  expect(saved.document.screens.slice(1).every(screen => screen.mirrorOf === 1)).toBe(true);
  expect(saved.document.screens[5].enabled).toBe(false);
});
test("a connected display receives changed prices without a reload", async ({ page }) => {
  await page.clock.install(); let saved = fixture();
  await page.route("**/api/signage/displays/1*", route => route.fulfill({ json: makeSnapshot(saved, 1) }));
  await page.goto("/display/1"); await expect(page.getByText("£6.00", { exact: true })).toBeVisible();
  saved = structuredClone(saved); saved.revision = 2; saved.document.items[0].variants[0].pricePence = 925;
  await page.clock.fastForward(11_000);
  await expect(page.getByText("£9.25", { exact: true })).toBeVisible();
});
test("304 responses confirm the cached version without emptying the display", async ({ page }) => {
  await page.clock.install(); let requests = 0;
  await page.route("**/api/signage/displays/1*", route => {
    requests++;
    return requests === 1 ? route.fulfill({ json: makeSnapshot(fixture(), 1) }) : route.fulfill({ status: 304, body: "" });
  });
  await page.goto("/display/1"); await expect(page.getByText("£6.00", { exact: true })).toBeVisible();
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem("display-cache-v1-1")!).validatedAt);
  await page.clock.fastForward(11_000);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("display-cache-v1-1")!).validatedAt)).toBeGreaterThan(before);
  await expect(page.getByText("£6.00", { exact: true })).toBeVisible();
});
test("offline prices expire and the display recovers on reconnection", async ({ page }) => {
  await page.clock.install(); let offline = false;
  await page.route("**/api/signage/displays/1*", route => offline ? route.abort() : route.fulfill({ json: makeSnapshot(fixture(), 1) }));
  await page.goto("/display/1"); await expect(page.getByText("£6.00", { exact: true })).toBeVisible();
  offline = true; await page.clock.fastForward(MAX_OFFLINE_MS + 2000);
  await expect(page.getByRole("heading", { name: "Menu temporarily unavailable" })).toBeVisible();
  await expect(page.getByText("£6.00", { exact: true })).toHaveCount(0);
  offline = false; await page.evaluate(() => window.dispatchEvent(new Event("online"))); await page.clock.fastForward(61_000);
  await expect(page.getByText("£6.00", { exact: true })).toBeVisible();
});
test("revocation clears the cached menu and requests a new code", async ({ page }) => {
  await page.clock.install(); let revoked = false;
  await page.route("**/api/signage/displays/1*", route => revoked
    ? route.fulfill({ status: 401, json: { error: "Pair this screen again." } })
    : route.fulfill({ json: makeSnapshot(fixture(), 1) }));
  await page.goto("/display/1"); await expect(page.getByText("£6.00", { exact: true })).toBeVisible();
  revoked = true; await page.clock.fastForward(11_000);
  await expect(page.getByRole("heading", { name: "Connect this display" })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("display-cache-v1-1"))).toBeNull();
});
test("promotion expiry works locally, independently of another API response", async ({ page }) => {
  const now = new Date("2026-10-10T12:00:00.000Z"); await page.clock.install({ time: now });
  const saved = fixture(); saved.document.screens[0].promotion = "Test promotion";
  saved.document.screens[0].promotionEndsAt = new Date(now.getTime() + 5000).toISOString();
  await page.route("**/api/signage/displays/1*", route => route.fulfill({ json: makeSnapshot(saved, 1) }));
  await page.goto("/display/1"); await expect(page.getByText("Test promotion", { exact: true })).toBeVisible();
  await page.clock.fastForward(6000); await expect(page.getByText("Test promotion", { exact: true })).toHaveCount(0);
});
test("pairing failure remains recoverable and never opens administration", async ({ page }) => {
  await page.route("**/api/signage/displays/1", route => route.fulfill({ status: 401, json: { error: "Pair this screen." } }));
  await page.route("**/api/signage/displays/1/pair", route => route.fulfill({ status: 401, json: { error: "That code has expired." } }));
  await page.goto("/display/1"); await page.getByLabel("Six-digit pairing code").fill("123456");
  await page.getByRole("button", { name: "Connect screen", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("expired");
  await expect(page.getByRole("button", { name: "Connect screen", exact: true })).toBeEnabled();
});
test("real server routes reject unauthenticated and cross-origin writes", async ({ request }) => {
  expect((await request.get("/api/signage/admin")).status()).toBe(401);
  expect((await request.get("/api/signage/displays/1")).status()).toBe(401);
  expect((await request.put("/api/signage/admin", { headers: { origin: "https://evil.example" }, data: {} })).status()).toBe(403);
  expect((await request.put("/api/signage/admin", { headers: { origin: "http://127.0.0.1:3000", cookie: `signage_display_1=${"a".repeat(64)}` }, data: {} })).status()).toBe(401);
  const page = await request.get("/display/7"); expect(page.status()).toBe(404);
});
