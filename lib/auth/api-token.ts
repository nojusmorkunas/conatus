import { createHash, randomBytes } from "node:crypto";

export function hashToken(raw: string) {
  // Unsalted SHA-256 is appropriate for uniformly random 192-bit tokens, not passwords.
  return createHash("sha256").update(raw).digest("hex");
}

export function generateToken() {
  const raw = `tdc_${randomBytes(24).toString("base64url")}`;
  return { raw, hash: hashToken(raw), prefix: raw.slice(0, 12) };
}

export function generateAgentToken() {
  const raw = `tdm_${randomBytes(24).toString("base64url")}`;
  return { raw, hash: hashToken(raw), prefix: raw.slice(0, 12) };
}
