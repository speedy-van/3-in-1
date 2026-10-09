import { test, expect } from "@playwright/test";
import { fixture } from "../tests/fixtures";
import { makeSnapshot } from "../src/lib/model";

test("an invalid price cannot be hidden by changing editor tabs", async ({ page }) => {
  await page.route("**/api/signage/admin", route => route.fulfill({ json: { ...fixture(), devices: [] } }));
  await page.goto("/admin/screens"); await page.getByRole("button", { name: "Menu & prices" }).click();
  const price = page.getByLabel("Price: Vegetable Pakora Standard", { exact: true });
  await price.fill("6.255"); await page.getByRole("button", { name: "Screens", exact: true }).click();
  await expect(price).toBeVisible(); await expect(price).toHaveValue("6.255");
  await price.fill("6.25"); await page.getByRole("button", { name: "Screens", exact: true }).click();
  await expect(page.getByLabel("Screen 1 heading", { exact: true })).toBeVisible();
});

test("pairing requests time out and the user can retry", async ({ page }) => {
  await page.clock.install();
  await page.addInitScript(() => {
    const original = window.fetch.bind(window);
    window.fetch = (input, init) => String(input).endsWith("/pair")
      ? new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
      }) : original(input, init);
  });
  await page.route("**/api/signage/displays/1", route => route.fulfill({ status: 401, json: { error: "Pair this screen." } }));
  await page.goto("/display/1"); await page.getByLabel("Six-digit pairing code").fill("123456");
  await page.getByRole("button", { name: "Connect screen", exact: true }).click();
  await page.clock.fastForward(11_000);
  await expect(page.getByRole("main").getByRole("alert")).toContainText("timed out");
  await expect(page.getByRole("button", { name: "Connect screen", exact: true })).toBeEnabled();
});

test("missing television browser capabilities have usable fallbacks", async ({ page }) => {
  await page.addInitScript(() => {
    Reflect.deleteProperty(Object.getPrototypeOf(navigator), "wakeLock");
    Object.defineProperty(Element.prototype, "requestFullscreen", { value: undefined, configurable: true });
  });
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await page.route("**/api/signage/displays/1*", route => route.fulfill({ json: makeSnapshot(fixture(), 1) }));
  await page.goto("/display/1"); await expect(page.getByText("£6.00", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Start full-screen display" }).click();
  await page.getByRole("button", { name: "Display controls", exact: true }).click();
  await expect(page.getByText("Use the TV browser's full-screen setting if available.", { exact: true })).toBeVisible();
  await expect(page.getByText("Unsupported. Disable the TV sleep timer in its settings.", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("paused, empty and failed-poster states never show misleading prices", async ({ page }) => {
  const saved = fixture(); saved.document.screens[0].enabled = false;
  await page.route("**/api/signage/displays/1*", route => route.fulfill({ json: makeSnapshot(saved, 1) }));
  await page.goto("/display/1"); await expect(page.getByRole("heading", { name: "Display paused" })).toBeVisible();
  saved.document.screens[0].enabled = true; saved.document.items = [];
  await page.reload(); await expect(page.getByText("No published items in the selected categories.", { exact: true })).toBeVisible();
  saved.document.screens[0].layout = "poster"; saved.document.screens[0].imageId = "cd9f6206-20d5-4d41-bc7b-ed0708179797";
  await page.route("**/api/signage/media/*", route => route.fulfill({ status: 404, body: "Not found" }));
  await page.reload(); await expect(page.getByText("The poster is temporarily unavailable.", { exact: true })).toBeVisible();
  await expect(page.getByText("£6.00", { exact: true })).toHaveCount(0);
});

test.describe("display-only offline shell", () => {
  test.use({ serviceWorkers: "allow" });
  test("a primed display reloads offline without caching APIs or administration", async ({ page, context }) => {
    let offline = false;
    await page.route("**/api/signage/displays/1*", route => offline ? route.abort() : route.fulfill({ json: makeSnapshot(fixture(), 1) }));
    await page.goto("/display/1"); await expect(page.getByText("£6.00", { exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(async () => Boolean(await caches.match(location.href)))).toBe(true);
    const cachedPaths = await page.evaluate(async () => {
      const cache = await caches.open("display-shell-v1");
      return (await cache.keys()).map(request => new URL(request.url).pathname);
    });
    expect(cachedPaths).toContain("/display/1");
    expect(cachedPaths.every(path => path === "/display/1" || path.startsWith("/_next/static/"))).toBe(true);
    offline = true; await context.setOffline(true);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByText("£6.00", { exact: true })).toBeVisible();
    await expect(page.getByText("Reconnecting", { exact: true })).toBeVisible();
  });
});
