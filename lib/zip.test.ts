import { deflateRawSync } from "node:zlib";
import { describe, expect, test } from "vitest";

import { readZipEntries } from "./zip";

function zipWithOneFile(name: string, content: string): Buffer {
  const nameBytes = Buffer.from(name);
  const data = Buffer.from(content);
  const compressed = deflateRawSync(data);
  const local = Buffer.alloc(30 + nameBytes.length);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0x800, 6);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(compressed.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(nameBytes.length, 26);
  nameBytes.copy(local, 30);

  const central = Buffer.alloc(46 + nameBytes.length);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0x800, 8);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(compressed.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(nameBytes.length, 28);
  nameBytes.copy(central, 46);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(central.length, 12);
  eocd.writeUInt32LE(local.length + compressed.length, 16);
  return Buffer.concat([local, compressed, central, eocd]);
}

describe("readZipEntries", () => {
  test("reads a deflated UTF-8 entry", () => {
    const result = readZipEntries(zipWithOneFile("Prøject.csv", "hello"), {
      maxEntries: 10,
      maxUncompressedBytes: 1_000,
    });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Prøject.csv");
    expect(result[0].data.toString()).toBe("hello");
  });

  test("enforces the uncompressed size limit", () => {
    expect(() =>
      readZipEntries(zipWithOneFile("project.csv", "hello"), {
        maxEntries: 10,
        maxUncompressedBytes: 4,
      }),
    ).toThrow(/too large/);
  });
});
