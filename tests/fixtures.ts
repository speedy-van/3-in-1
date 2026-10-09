import { seededDocument } from "../src/lib/seed";
import type { SavedDocument } from "../src/lib/model";
export function fixture(): SavedDocument {
  const document = seededDocument();
  document.items = document.items.slice(0, 8).map(item => ({ ...item, status: "published" }));
  document.screens = document.screens.map(screen => ({ ...screen, enabled: true, title: `Screen ${screen.id} menu` }));
  return { document, revision: 1 };
}
