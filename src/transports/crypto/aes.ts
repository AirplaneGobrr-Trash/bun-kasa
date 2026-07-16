import { createCipheriv, createDecipheriv } from "node:crypto";

/** AES-CBC encrypt with PKCS7 padding (Node pads/unpads automatically). */
export function aesCbcEncrypt(key: Buffer, iv: Buffer, data: Buffer): Buffer {
  const algorithm = key.length === 32 ? "aes-256-cbc" : "aes-128-cbc";
  const cipher = createCipheriv(algorithm, key, iv);
  return Buffer.concat([cipher.update(data), cipher.final()]);
}

/** AES-CBC decrypt with PKCS7 padding (Node pads/unpads automatically). */
export function aesCbcDecrypt(key: Buffer, iv: Buffer, data: Buffer): Buffer {
  const algorithm = key.length === 32 ? "aes-256-cbc" : "aes-128-cbc";
  const decipher = createDecipheriv(algorithm, key, iv);
  return Buffer.concat([decipher.update(data), decipher.final()]);
}

/** AES encryption session used by the AES (Tapo) transport: fixed key/iv for the session. */
export class AesEncryptionSession {
  constructor(
    private readonly key: Buffer,
    private readonly iv: Buffer,
  ) {}

  static createFromHandshakeKey(keyAndIv: Buffer): AesEncryptionSession {
    return new AesEncryptionSession(keyAndIv.subarray(0, 16), keyAndIv.subarray(16));
  }

  encrypt(data: Buffer): Buffer {
    return Buffer.from(aesCbcEncrypt(this.key, this.iv, data).toString("base64"));
  }

  decrypt(data: Buffer): string {
    return aesCbcDecrypt(
      this.key,
      this.iv,
      Buffer.from(data.toString(), "base64"),
    ).toString("utf-8");
  }
}
