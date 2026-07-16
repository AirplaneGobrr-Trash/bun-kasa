import { createHash } from "node:crypto";

export function md5(payload: Buffer): Buffer {
  return createHash("md5").update(payload).digest();
}

export function sha1(payload: Buffer): Buffer {
  return createHash("sha1").update(payload).digest();
}

export function sha256(payload: Buffer): Buffer {
  return createHash("sha256").update(payload).digest();
}
