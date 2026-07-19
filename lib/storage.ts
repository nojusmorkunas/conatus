import { Client } from "minio";

// Reuse the client across dev HMR reloads, same reasoning as lib/db/index.ts.
const globalForStorage = globalThis as unknown as { minioClient?: Client };

export const s3 =
  globalForStorage.minioClient ??
  new Client({
    endPoint: process.env.S3_ENDPOINT!,
    port: Number(process.env.S3_PORT),
    useSSL: false,
    accessKey: process.env.S3_ACCESS_KEY!,
    secretKey: process.env.S3_SECRET_KEY!,
  });
if (process.env.NODE_ENV !== "production") globalForStorage.minioClient = s3;

export const BUCKET = process.env.S3_BUCKET!;

let bucketReady: Promise<void> | null = null;

// Idempotent, cached per-process — callers just await this before any
// putObject/getObject/removeObject.
export function ensureBucket() {
  bucketReady ??= s3
    .bucketExists(BUCKET)
    .then((exists) => {
      if (!exists) return s3.makeBucket(BUCKET);
    })
    .catch((error) => {
      // Two requests racing to create the bucket on first use; MinIO
      // returns an "already owned by you" error for the loser.
      if (error?.code === "BucketAlreadyOwnedByYou") return;
      bucketReady = null;
      throw error;
    });
  return bucketReady;
}
