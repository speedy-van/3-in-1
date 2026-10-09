import { readFileSync, existsSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import { seededDocument } from "../src/lib/seed";
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required. No database was changed.");
const sql = neon(process.env.DATABASE_URL);
const statements = readFileSync("db/001_signage.sql", "utf8").split("-- statement-break").map(s => s.trim()).filter(Boolean);
const initial = seededDocument();
await sql.transaction([
  ...statements.map(statement => sql.query(statement)),
  sql.query("INSERT INTO signage_document(id, document) VALUES (1, $1::jsonb) ON CONFLICT(id) DO NOTHING", [JSON.stringify(initial)])
]);
console.log("Migration complete. Existing data was preserved. New menu items remain drafts and screens remain disabled.");
