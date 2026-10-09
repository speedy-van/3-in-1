import { z } from "zod";

export const SCREEN_IDS = [1, 2, 3, 4, 5, 6] as const;
export const POLL_MS = 10_000;
export const MAX_OFFLINE_MS = 15 * 60_000;
const id = z.string().min(1).max(80).regex(/^[a-zA-Z0-9_-]+$/);
const mediaId = z.string().uuid().nullable();
export const variantSchema = z.object({
  id, label: z.string().trim().min(1).max(80),
  pricePence: z.number().int().min(0).max(100_000)
}).strict();
export const itemSchema = z.object({
  id, categoryId: id, name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(300),
  status: z.enum(["draft", "published"]), available: z.boolean(), imageId: mediaId,
  variants: z.array(variantSchema).min(1).max(30)
}).strict();
export const screenSchema = z.object({
  id: z.number().int().min(1).max(6), name: z.string().trim().min(1).max(60),
  enabled: z.boolean(), mirrorOf: z.number().int().min(1).max(6).nullable(),
  title: z.string().trim().min(1).max(100),
  layout: z.enum(["menu", "poster"]), orientation: z.enum(["landscape", "portrait"]),
  categoryIds: z.array(id).max(40), imageId: mediaId,
  itemsPerPage: z.number().int().min(2).max(12),
  rotationSeconds: z.number().int().min(8).max(60),
  promotion: z.string().trim().max(160),
  promotionEndsAt: z.string().datetime().nullable()
}).strict();
export type MenuItem = z.infer<typeof itemSchema>;
export type Screen = z.infer<typeof screenSchema>;
export const documentSchema = z.object({
  categories: z.array(z.object({ id, name: z.string().trim().min(1).max(80) }).strict()).max(40),
  items: z.array(itemSchema).max(600),
  screens: z.array(screenSchema).length(6)
}).strict().superRefine((doc, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: "custom", message });
  const unique = (values: (string | number)[]) => new Set(values).size === values.length;
  if (!unique(doc.categories.map(c => c.id))) fail("Category IDs must be unique.");
  if (!unique(doc.items.map(i => i.id))) fail("Item IDs must be unique.");
  if (!unique(doc.screens.map(s => s.id))) fail("Exactly screens 1 to 6 are required.");
  const categories = new Set(doc.categories.map(c => c.id));
  for (const item of doc.items) {
    if (!categories.has(item.categoryId)) fail("Every item needs an existing category.");
    if (!unique(item.variants.map(v => v.id))) fail("Variant IDs must be unique within an item.");
  }
  for (const screen of doc.screens) {
    if (!unique(screen.categoryIds) || screen.categoryIds.some(c => !categories.has(c))) fail("Invalid screen categories.");
    if (screen.promotion && !screen.promotionEndsAt) fail("Every promotion needs an expiry time.");
    const visited = new Set<number>();
    let current: Screen | undefined = screen;
    while (current) {
      if (visited.has(current.id)) { fail("Screens cannot mirror themselves or form a loop."); break; }
      visited.add(current.id);
      const sourceId: number | null = current.mirrorOf;
      current = sourceId === null ? undefined : doc.screens.find(s => s.id === sourceId);
    }
  }
});
export type MenuDocument = z.infer<typeof documentSchema>;
export type SavedDocument = { document: MenuDocument; revision: number };
export type DeviceStatus = { screenId: number; lastSeen: string | null; reportedRevision: number | null; paired: boolean };
export const snapshotSchema = z.object({
  screen: screenSchema, items: z.array(itemSchema),
  categories: z.array(z.object({ id: z.string(), name: z.string() })),
  revision: z.number().int().positive()
});
export type DisplaySnapshot = z.infer<typeof snapshotSchema>;
export type DisplayCache = { snapshot: DisplaySnapshot; validatedAt: number };

export function initialDocument(): MenuDocument {
  return { categories: [], items: [], screens: SCREEN_IDS.map(id => ({
    id, name: `Screen ${id}`, enabled: false, mirrorOf: null,
    title: "Fresh from our kitchen", layout: "menu", orientation: "landscape",
    categoryIds: [], imageId: null, itemsPerPage: 6, rotationSeconds: 12,
    promotion: "", promotionEndsAt: null
  })) };
}
export function resolveScreen(doc: MenuDocument, screenId: number): Screen {
  const own = doc.screens.find(s => s.id === screenId);
  if (!own) throw new Error("Unknown screen.");
  let current = own;
  const visited = new Set<number>();
  let enabled = own.enabled;
  while (current.mirrorOf !== null) {
    if (visited.has(current.id)) throw new Error("Mirror loop.");
    visited.add(current.id);
    const next = doc.screens.find(s => s.id === current.mirrorOf);
    if (!next) throw new Error("Unknown source screen.");
    enabled = enabled && next.enabled;
    current = next;
  }
  return { ...current, id: own.id, name: own.name, enabled, mirrorOf: own.mirrorOf };
}
export function mirrorAll(doc: MenuDocument, sourceId: number): MenuDocument {
  const resolved = resolveScreen(doc, sourceId);
  return documentSchema.parse({ ...doc, screens: doc.screens.map(screen => screen.id === sourceId
    ? { ...resolved, mirrorOf: null }
    : { ...screen, mirrorOf: sourceId }) });
}
export function makeSnapshot(saved: SavedDocument, screenId: number): DisplaySnapshot {
  const screen = resolveScreen(saved.document, screenId);
  const categories = saved.document.categories.filter(c => !screen.categoryIds.length || screen.categoryIds.includes(c.id));
  const allowed = new Set(categories.map(c => c.id));
  const items = screen.enabled && screen.layout === "menu"
    ? saved.document.items.filter(i => i.status === "published" && i.available && allowed.has(i.categoryId)) : [];
  return { screen, categories, items, revision: saved.revision };
}
export function cacheIsFresh(cache: DisplayCache | null, now: number): boolean {
  if (!cache || !Number.isFinite(cache.validatedAt)) return false;
  const age = now - cache.validatedAt;
  return age >= 0 && age < MAX_OFFLINE_MS;
}
export function promotionIsActive(screen: Screen, now: number): boolean {
  return Boolean(screen.promotion && screen.promotionEndsAt && now < Date.parse(screen.promotionEndsAt));
}
export function pricePence(input: string): number | null {
  if (!/^\d{1,4}(\.\d{1,2})?$/.test(input)) return null;
  const [pounds, fraction = ""] = input.split(".");
  const pence = Number(pounds) * 100 + Number(fraction.padEnd(2, "0"));
  return pence <= 100_000 ? pence : null;
}
export const formatMoney = (pence: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(pence / 100);
export const imageUrl = (assetId: string) => `/api/signage/media/${assetId}`;
export function menuRows(snapshot: DisplaySnapshot) {
  return snapshot.categories.flatMap(category => snapshot.items.filter(item => item.categoryId === category.id).flatMap(item =>
    item.variants.map(variant => ({ key: `${item.id}:${variant.id}`, category: category.name, item, variant }))));
}
