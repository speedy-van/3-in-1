import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
export const digest = (text: string) => createHash("sha256").update(text).digest("hex");
export const randomToken = () => randomBytes(32).toString("hex");
export const pairingDigest = (screenId: number, code: string) => digest(`screen:${screenId}:${code}`);
export function validPasswordHash(hash: string): boolean {
  return /^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(hash);
}
export async function checkPassword(password: string, hash: string): Promise<boolean> {
  if (!validPasswordHash(hash) || password.length < 14 || password.length > 256) return false;
  const [, salt, hex] = hash.split("$");
  const result = await new Promise<Buffer>((resolve, reject) => scrypt(password, salt, 64,
    { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, value) => error ? reject(error) : resolve(value)));
  return timingSafeEqual(result, Buffer.from(hex, "hex"));
}
export class HttpError extends Error { constructor(public readonly status: number, message: string) { super(message); } }
export function assertOrigin(request: Request, origin: string) {
  if (request.headers.get("origin") !== origin) throw new HttpError(403, "This request is not allowed from another website.");
}
export async function limitedBody(request: Request, maxBytes: number): Promise<Buffer> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw new HttpError(413, "The upload is too large.");
  const reader = request.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new HttpError(413, "The upload is too large."); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks);
}
