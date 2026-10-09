import { z } from "zod";
import raw from "../../data/menu-draft.json" with { type: "json" };
import { documentSchema, initialDocument } from "./model";
const seedSchema = z.array(z.tuple([z.string(), z.array(z.tuple([z.string(), z.array(z.tuple([z.string(), z.number().int()]))]))]));
/** Owner-supplied research dated 2026-10-09. This is not an approved live menu. */
export function seededDocument() {
  const data = seedSchema.parse(raw);
  const categories = data.map(([name], index) => ({ id: `category-${index + 1}`, name }));
  const items = data.flatMap(([, entries], categoryIndex) => entries.map(([name, variants], itemIndex) => ({
    id: `research-${categoryIndex + 1}-${itemIndex + 1}`, categoryId: categories[categoryIndex].id,
    name, description: "", status: "draft" as const, available: true, imageId: null,
    variants: variants.map(([label, pricePence], index) => ({ id: `option-${index + 1}`, label, pricePence }))
  })));
  return documentSchema.parse({ ...initialDocument(), categories, items });
}
