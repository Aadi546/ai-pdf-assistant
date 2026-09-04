/**
 * Every module that needs to store/fetch a file depends on this interface,
 * never on the S3 SDK directly — swapping MinIO/S3/R2/Supabase Storage for
 * something else later (spec §3) means writing one new class, not touching
 * every caller.
 */
export interface ObjectStorage {
  upload(key: string, body: Buffer, contentType: string): Promise<void>;
  /** Raw bytes, for server-side processing (e.g. the ingestion worker) — not for handing to a client. */
  download(key: string): Promise<Buffer>;
  getSignedDownloadUrl(key: string, expiresInSeconds?: number): Promise<string>;
  delete(key: string): Promise<void>;
}

export const OBJECT_STORAGE = Symbol("OBJECT_STORAGE");
