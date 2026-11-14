import { Client } from "minio";

// Reuse the client across dev HMR reloads, same reasoning as lib/db/index.ts.
const globalForStorage = globalThis as unknown as { minioClient?: Client };

// Without a region, minio-js finds each bucket's region with a request signed
// for us-east-1. Set S3_REGION for servers that reject it, such as Garage.
const region = process.env.S3_REGION?.trim() || undefined;

export const s3 =
  globalForStorage.minioClient ??
  new Client({
    endPoint: process.env.S3_ENDPOINT!,
    port: Number(process.env.S3_PORT),
    useSSL: process.env.S3_USE_SSL === "1",
    accessKey: process.env.S3_ACCESS_KEY!,
    secretKey: process.env.S3_SECRET_KEY!,
    region,
  });
if (process.env.NODE_ENV !== "production") globalForStorage.minioClient = s3;

export const BUCKET = process.env.S3_BUCKET!;

let bucketReady: Promise<void> | null = null;

// Idempotent and cached per process. Callers await this before any
// putObject/getObject/removeObject.
export function ensureBucket() {
  bucketReady ??= s3
    .bucketExists(BUCKET)
    .then((exists) => {
      // Sends the region as the bucket's LocationConstraint.
      if (!exists) return s3.makeBucket(BUCKET, region);
    })
    .catch((error) => {
      // Two requests racing to create the bucket on first use; the S3
      // server returns an "already owned by you" error for the loser.
      if (error?.code === "BucketAlreadyOwnedByYou") return;
      bucketReady = null;
      throw error;
    });
  return bucketReady;
}
