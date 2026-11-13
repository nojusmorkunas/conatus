import { afterEach, describe, expect, test, vi } from "vitest";

const clients = vi.hoisted(
  () => [] as { options: Record<string, unknown>; makeBucket: ReturnType<typeof vi.fn> }[],
);

vi.mock("minio", () => ({
  Client: class {
    makeBucket = vi.fn(async () => {});
    bucketExists = vi.fn(async () => false);
    constructor(options: Record<string, unknown>) {
      clients.push({ options, makeBucket: this.makeBucket });
    }
  },
}));

// storage.ts builds its client at import time and caches it on globalThis
// outside production, so each case clears both before importing again.
async function loadStorage(region?: string) {
  vi.resetModules();
  delete (globalThis as { minioClient?: unknown }).minioClient;
  vi.stubEnv("S3_REGION", region);
  vi.stubEnv("S3_BUCKET", "attachments");
  const storage = await import("./storage");
  return { storage, client: clients.at(-1)! };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("storage client", () => {
  test("signs for S3_REGION and creates the bucket there", async () => {
    const { storage, client } = await loadStorage(" garage\n");
    expect(client.options.region).toBe("garage");
    await storage.ensureBucket();
    expect(client.makeBucket).toHaveBeenCalledWith("attachments", "garage");
  });

  test.each([undefined, "", "  "])(
    "leaves the region to minio-js when S3_REGION is %j",
    async (value) => {
      const { storage, client } = await loadStorage(value);
      expect(client.options.region).toBeUndefined();
      await storage.ensureBucket();
      expect(client.makeBucket).toHaveBeenCalledWith("attachments", undefined);
    },
  );
});
