import { createHash } from "node:crypto";

/** Ported near-verbatim from ref/camera/speaker/auth.ts. */

function md5hex(...parts: string[]): string {
  return createHash("md5").update(parts.join(":")).digest("hex");
}

export function derivePassword(cloudPass: string, encryptType: string): string {
  return encryptType === "3"
    ? createHash("sha256").update(cloudPass).digest("hex").toUpperCase()
    : createHash("md5").update(cloudPass).digest("hex").toUpperCase();
}

export function digestAuth(
  user: string,
  pw: string,
  realm: string,
  nonce: string,
  qop: string,
  opaque: string,
): string {
  const nc = "00000001";
  const cnonce = createHash("md5")
    .update(Math.random().toString())
    .digest("hex")
    .slice(0, 16);
  const ha1 = md5hex(user, realm, pw);
  const ha2 = md5hex("POST", "/stream");
  const resp = md5hex(ha1, nonce, nc, cnonce, qop, ha2);
  let h = `Digest username="${user}", realm="${realm}", nonce="${nonce}", uri="/stream", qop=${qop}, nc=${nc}, cnonce="${cnonce}", response="${resp}"`;
  if (opaque) h += `, opaque="${opaque}", algorithm=MD5`;
  return h;
}
