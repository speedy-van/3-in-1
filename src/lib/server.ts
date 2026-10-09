import "server-only";
import { neon } from "@neondatabase/serverless";
import { SignageRepository } from "./repository";
import { HttpError, validPasswordHash } from "./security";
export function serverConfig() {
  const { DATABASE_URL, APP_ORIGIN, ADMIN_PASSWORD_HASH } = process.env;
  if (!DATABASE_URL || !APP_ORIGIN || !ADMIN_PASSWORD_HASH || !validPasswordHash(ADMIN_PASSWORD_HASH)) {
    throw new HttpError(503, "Server setup is incomplete. Configure the database, public origin and administrator password hash.");
  }
  let origin: URL;
  try { origin = new URL(APP_ORIGIN); } catch { throw new HttpError(503, "The public origin is invalid."); }
  if (origin.origin !== APP_ORIGIN || origin.username || origin.password ||
      (origin.protocol !== "https:" && !(origin.protocol === "http:" && ["localhost", "127.0.0.1"].includes(origin.hostname)))) {
    throw new HttpError(503, "Use an exact HTTPS origin, or HTTP localhost for local development.");
  }
  return { databaseUrl: DATABASE_URL, origin: APP_ORIGIN, passwordHash: ADMIN_PASSWORD_HASH, secure: origin.protocol === "https:" };
}
export function repository(databaseUrl: string) {
  const sql = neon(databaseUrl);
  return new SignageRepository(async (text, values = []) => await sql.query(text, values) as Record<string, unknown>[]);
}
