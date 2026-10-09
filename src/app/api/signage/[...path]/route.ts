import { NextRequest, NextResponse } from "next/server";
import { randomInt, randomUUID } from "node:crypto";
import sharp from "sharp";
import { z } from "zod";
import { documentSchema, makeSnapshot } from "@/lib/model";
import { repository, serverConfig } from "@/lib/server";
import { assertOrigin, checkPassword, digest, HttpError, limitedBody, pairingDigest, randomToken } from "@/lib/security";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const jsonHeaders = { "Cache-Control": "no-store, max-age=0", "X-Robots-Tag": "noindex, nofollow" };
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: jsonHeaders });
const adminCookie = "signage_admin";
const deviceCookie = (id: number) => `signage_display_${id}`;
const tokenValid = (token: string | undefined): token is string => Boolean(token && /^[a-f0-9]{64}$/.test(token));
async function body(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new HttpError(415, "Expected JSON.");
  try { return JSON.parse((await limitedBody(request, 1_000_000)).toString("utf8")); }
  catch (error) { if (error instanceof HttpError) throw error; throw new HttpError(400, "The request body is not valid JSON."); }
}
async function handle(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  try {
    const { path } = await context.params;
    const endpoint = path.join("/"); const method = request.method;
    const config = serverConfig(); const repo = repository(config.databaseUrl);
    if (method !== "GET") assertOrigin(request, config.origin);
    const adminToken = request.cookies.get(adminCookie)?.value;
    const credentialHash = digest(config.passwordHash);
    const cookieOptions = { httpOnly: true, secure: config.secure, sameSite: "strict" as const, path: "/", maxAge: 12 * 3600 };
    const requireAdmin = async () => {
      if (!tokenValid(adminToken) || !await repo.sessionExists(digest(adminToken), credentialHash)) throw new HttpError(401, "Sign in to manage the screens.");
    };
    const limit = async (key: string, maximum: number, seconds: number) => {
      if (!await repo.allow(key, maximum, seconds)) throw new HttpError(429, "Too many attempts. Please try again later.");
    };
    if (endpoint === "login" && method === "POST") {
      await limit("login", 20, 900);
      const parsed = z.object({ password: z.string().min(14).max(256) }).strict().parse(await body(request));
      if (!await checkPassword(parsed.password, config.passwordHash)) throw new HttpError(401, "The password is incorrect.");
      const token = randomToken(); await repo.createSession(digest(token), credentialHash);
      const response = json({ ok: true }); response.cookies.set(adminCookie, token, cookieOptions); return response;
    }
    if (endpoint === "logout" && method === "POST") {
      if (tokenValid(adminToken)) await repo.deleteSession(digest(adminToken));
      const response = json({ ok: true }); response.cookies.set(adminCookie, "", { ...cookieOptions, maxAge: 0 }); return response;
    }
    if (path[0] === "admin") {
      await requireAdmin();
      if (method !== "GET") await limit("admin-writes", 120, 60);
      if (endpoint === "admin" && method === "GET") return json({ ...await repo.read(), devices: await repo.devices() });
      if (endpoint === "admin" && method === "PUT") {
        const parsed = z.object({ expectedRevision: z.number().int().positive(), document: documentSchema }).strict().parse(await body(request));
        const saved = await repo.save(parsed.expectedRevision, parsed.document);
        if (!saved) throw new HttpError(409, "Another administrator saved changes. Reload the saved version before trying again.");
        return json(saved);
      }
      if (endpoint === "admin/devices" && method === "GET") return json({ devices: await repo.devices() });
      if (path.length === 4 && path[1] === "screens" && /^[1-6]$/.test(path[2])) {
        const screenId = Number(path[2]);
        if (path[3] === "pair" && method === "POST") {
          const code = String(randomInt(100000, 1000000)); await repo.pairingCode(screenId, pairingDigest(screenId, code));
          return json({ code, expiresInSeconds: 600 });
        }
        if (path[3] === "revoke" && method === "POST") { await repo.revoke(screenId); return json({ ok: true }); }
      }
      if (endpoint === "admin/images" && method === "POST") {
        await limit("image-uploads", 30, 60);
        const bytes = await limitedBody(request, 3 * 1024 * 1024);
        let converted;
        try {
          const input = sharp(bytes, { limitInputPixels: 20_000_000, animated: false });
          const metadata = await input.metadata();
          if (!["jpeg", "png", "webp"].includes(metadata.format ?? "")) throw new Error("Unsupported format");
          converted = await input.rotate().resize({ width: 1920, height: 1920, fit: "inside", withoutEnlargement: true }).webp({ quality: 85 }).toBuffer({ resolveWithObject: true });
        } catch { throw new HttpError(415, "Upload a valid JPG, PNG or WebP image, up to 3 MB and 20 megapixels."); }
        const id = randomUUID(); await repo.storeImage(id, converted.data, converted.info.width, converted.info.height);
        return json({ id, width: converted.info.width, height: converted.info.height }, 201);
      }
    }
    if (path.length === 2 && path[0] === "media" && method === "GET") {
      const id = z.string().uuid().parse(path[1]); const image = await repo.image(id);
      if (!image) throw new HttpError(404, "Image not found.");
      return new NextResponse(new Uint8Array(Buffer.from(image.bytes, "base64")), { headers: {
        "Content-Type": "image/webp", "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex", "Content-Security-Policy": "default-src 'none'"
      } });
    }
    if (path[0] === "displays" && /^[1-6]$/.test(path[1] ?? "")) {
      const screenId = Number(path[1]);
      const options = { ...cookieOptions, path: `/api/signage/displays/${screenId}`, maxAge: 90 * 24 * 3600 };
      if (path.length === 3 && path[2] === "pair" && method === "POST") {
        await limit(`pair-${screenId}`, 6, 60);
        const { code } = z.object({ code: z.string().regex(/^\d{6}$/) }).strict().parse(await body(request));
        const token = randomToken();
        if (!await repo.pair(screenId, pairingDigest(screenId, code), digest(token))) throw new HttpError(401, "That pairing code is incorrect, expired or already used.");
        const response = json({ ok: true }); response.cookies.set(deviceCookie(screenId), token, options); return response;
      }
      if (path.length === 2 && method === "GET") {
        const token = request.cookies.get(deviceCookie(screenId))?.value;
        const version = Number(request.nextUrl.searchParams.get("revision"));
        if (!tokenValid(token) || !await repo.authenticateDisplay(screenId, digest(token), Number.isSafeInteger(version) && version > 0 ? version : null)) throw new HttpError(401, "Pair this screen with the administrator's current code.");
        const saved = await repo.read(); const etag = `"${screenId}-${saved.revision}"`;
        const response = request.headers.get("if-none-match") === etag
          ? new NextResponse(null, { status: 304, headers: { ...jsonHeaders, ETag: etag } })
          : json(makeSnapshot(saved, screenId));
        response.headers.set("ETag", etag);
        response.cookies.set(deviceCookie(screenId), token, options);
        return response;
      }
    }
    if (endpoint === "menu" && method === "GET") {
      const { document, revision } = await repo.read();
      return json({ categories: document.categories, items: document.items.filter(item => item.status === "published" && item.available), revision });
    }
    throw new HttpError(404, "This endpoint does not exist.");
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message }, error.status);
    if (error instanceof z.ZodError) return json({ error: error.issues[0]?.message ?? "Check the submitted information." }, 400);
    console.error("Signage request failed:", error instanceof Error ? error.name : "UnknownError");
    return json({ error: "The service is temporarily unavailable. Check the server setup and try again." }, 503);
  }
}
export const GET = handle;
export const POST = handle;
export const PUT = handle;
