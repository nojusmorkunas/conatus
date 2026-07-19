import { inflateRawSync } from "node:zlib";

export type ZipEntry = {
  name: string;
  data: Buffer;
};

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

export function readZipEntries(
  input: Buffer,
  limits: { maxEntries: number; maxUncompressedBytes: number },
): ZipEntry[] {
  const minimumOffset = Math.max(0, input.length - 65_557);
  let eocdOffset = -1;
  for (let offset = input.length - 22; offset >= minimumOffset; offset--) {
    if (input.readUInt32LE(offset) === EOCD_SIGNATURE) {
      eocdOffset = offset;
      break;
    }
  }
  if (eocdOffset < 0) throw new Error("The ZIP file is invalid or unsupported.");

  const entryCount = input.readUInt16LE(eocdOffset + 10);
  const centralOffset = input.readUInt32LE(eocdOffset + 16);
  if (entryCount === 0xffff || centralOffset === 0xffffffff) {
    throw new Error("ZIP64 backups are not supported.");
  }
  if (entryCount > limits.maxEntries) {
    throw new Error(`The ZIP contains more than ${limits.maxEntries} files.`);
  }

  const entries: ZipEntry[] = [];
  let totalUncompressed = 0;
  let offset = centralOffset;
  for (let index = 0; index < entryCount; index++) {
    if (offset + 46 > input.length || input.readUInt32LE(offset) !== CENTRAL_SIGNATURE) {
      throw new Error("The ZIP central directory is invalid.");
    }

    const flags = input.readUInt16LE(offset + 8);
    const method = input.readUInt16LE(offset + 10);
    const compressedSize = input.readUInt32LE(offset + 20);
    const uncompressedSize = input.readUInt32LE(offset + 24);
    const nameLength = input.readUInt16LE(offset + 28);
    const extraLength = input.readUInt16LE(offset + 30);
    const commentLength = input.readUInt16LE(offset + 32);
    const localOffset = input.readUInt32LE(offset + 42);
    const nameStart = offset + 46;
    const nameEnd = nameStart + nameLength;
    if (nameEnd > input.length) throw new Error("The ZIP contains an invalid filename.");
    const encoding = flags & 0x800 ? "utf8" : "latin1";
    const name = input.subarray(nameStart, nameEnd).toString(encoding);
    offset = nameEnd + extraLength + commentLength;

    if (name.endsWith("/")) continue;
    if (flags & 0x1) throw new Error("Password-protected ZIP files are not supported.");
    if (method !== 0 && method !== 8) {
      throw new Error(`The ZIP uses unsupported compression for ${name}.`);
    }
    totalUncompressed += uncompressedSize;
    if (totalUncompressed > limits.maxUncompressedBytes) {
      throw new Error("The uncompressed backup is too large.");
    }
    if (localOffset + 30 > input.length || input.readUInt32LE(localOffset) !== LOCAL_SIGNATURE) {
      throw new Error("The ZIP contains an invalid file entry.");
    }
    const localNameLength = input.readUInt16LE(localOffset + 26);
    const localExtraLength = input.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > input.length) throw new Error("The ZIP contains truncated file data.");

    const compressed = input.subarray(dataStart, dataEnd);
    const data = method === 0
      ? Buffer.from(compressed)
      : inflateRawSync(compressed, { maxOutputLength: uncompressedSize + 1 });
    if (data.length !== uncompressedSize) {
      throw new Error(`The ZIP entry ${name} has an invalid size.`);
    }
    entries.push({ name, data });
  }
  return entries;
}
