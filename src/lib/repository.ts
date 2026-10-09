import { documentSchema, type MenuDocument, type SavedDocument, type DeviceStatus } from "./model";
export type Query = (text: string, values?: unknown[]) => Promise<Record<string, unknown>[]>;
const iso = (value: unknown) => value ? new Date(String(value)).toISOString() : null;

/** Parameterised persistence, shared by Neon and the real PostgreSQL test engine. */
export class SignageRepository {
  constructor(private readonly query: Query) {}
  async read(): Promise<SavedDocument> {
    const [row] = await this.query("SELECT document, revision FROM signage_document WHERE id = 1");
    if (!row) throw new Error("Run the documented database migration first.");
    return { document: documentSchema.parse(row.document), revision: Number(row.revision) };
  }
  async save(expectedRevision: number, input: MenuDocument): Promise<SavedDocument | null> {
    const document = documentSchema.parse(input);
    const imageIds = [...new Set([...document.items, ...document.screens].map(v => v.imageId).filter(Boolean))];
    if (imageIds.length) {
      const assets = await this.query("SELECT id::text FROM signage_images WHERE id = ANY($1::uuid[])", [imageIds]);
      if (assets.length !== imageIds.length) throw new Error("A selected image no longer exists.");
    }
    const [row] = await this.query(
      "UPDATE signage_document SET document = $1::jsonb, revision = revision + 1, updated_at = now() WHERE id = 1 AND revision = $2 RETURNING document, revision",
      [JSON.stringify(document), expectedRevision]
    );
    return row ? { document: documentSchema.parse(row.document), revision: Number(row.revision) } : null;
  }
  async allow(key: string, limit: number, seconds: number): Promise<boolean> {
    const [row] = await this.query(`INSERT INTO signage_rate_limits(key, attempts, reset_at)
      VALUES ($1, 1, now() + $2 * interval '1 second')
      ON CONFLICT(key) DO UPDATE SET
        attempts = CASE WHEN signage_rate_limits.reset_at <= now() THEN 1 ELSE signage_rate_limits.attempts + 1 END,
        reset_at = CASE WHEN signage_rate_limits.reset_at <= now() THEN EXCLUDED.reset_at ELSE signage_rate_limits.reset_at END
      RETURNING attempts`, [key, seconds]);
    return Number(row.attempts) <= limit;
  }
  async createSession(tokenHash: string, credentialHash: string) {
    await this.query("DELETE FROM signage_sessions WHERE expires_at <= now() OR credential_hash <> $1", [credentialHash]);
    await this.query("INSERT INTO signage_sessions(token_hash, credential_hash, expires_at) VALUES ($1, $2, now() + interval '12 hours')", [tokenHash, credentialHash]);
  }
  async sessionExists(tokenHash: string, credentialHash: string): Promise<boolean> {
    return (await this.query("SELECT 1 FROM signage_sessions WHERE token_hash = $1 AND credential_hash = $2 AND expires_at > now()", [tokenHash, credentialHash])).length === 1;
  }
  async deleteSession(tokenHash: string) { await this.query("DELETE FROM signage_sessions WHERE token_hash = $1", [tokenHash]); }
  async pairingCode(screenId: number, hash: string) {
    await this.query(`INSERT INTO signage_devices(screen_id, code_hash, code_expires_at) VALUES ($1, $2, now() + interval '10 minutes')
      ON CONFLICT(screen_id) DO UPDATE SET code_hash = EXCLUDED.code_hash, code_expires_at = EXCLUDED.code_expires_at`, [screenId, hash]);
  }
  async pair(screenId: number, codeHash: string, tokenHash: string): Promise<boolean> {
    const rows = await this.query(`UPDATE signage_devices SET token_hash = $3, token_expires_at = now() + interval '90 days',
      code_hash = NULL, code_expires_at = NULL, last_seen = now(), reported_revision = NULL
      WHERE screen_id = $1 AND code_hash = $2 AND code_expires_at > now() RETURNING screen_id`, [screenId, codeHash, tokenHash]);
    return rows.length === 1;
  }
  async authenticateDisplay(screenId: number, tokenHash: string, revision: number | null): Promise<boolean> {
    const rows = await this.query(`UPDATE signage_devices SET last_seen = now(), reported_revision = $3,
      token_expires_at = now() + interval '90 days'
      WHERE screen_id = $1 AND token_hash = $2 AND token_expires_at > now() RETURNING screen_id`, [screenId, tokenHash, revision]);
    return rows.length === 1;
  }
  async revoke(screenId: number) {
    await this.query(`UPDATE signage_devices SET token_hash = NULL, token_expires_at = NULL, code_hash = NULL,
      code_expires_at = NULL, last_seen = NULL, reported_revision = NULL WHERE screen_id = $1`, [screenId]);
  }
  async devices(): Promise<DeviceStatus[]> {
    const rows = await this.query("SELECT screen_id, last_seen, reported_revision, (token_hash IS NOT NULL AND token_expires_at > now()) AS paired FROM signage_devices ORDER BY screen_id");
    return rows.map(row => ({ screenId: Number(row.screen_id), lastSeen: iso(row.last_seen),
      reportedRevision: row.reported_revision === null ? null : Number(row.reported_revision), paired: Boolean(row.paired) }));
  }
  async image(id: string): Promise<{ bytes: string; width: number; height: number } | null> {
    const [row] = await this.query("SELECT encode(content, 'base64') AS bytes, width, height FROM signage_images WHERE id = $1", [id]);
    return row ? { bytes: String(row.bytes), width: Number(row.width), height: Number(row.height) } : null;
  }
  async storeImage(id: string, bytes: Buffer, width: number, height: number) {
    // Bind text and decode inside PostgreSQL to avoid driver-specific bytea serialisation.
    await this.query("INSERT INTO signage_images(id, content, width, height) VALUES ($1, decode($2, 'hex'), $3, $4)", [id, bytes.toString("hex"), width, height]);
  }
}
