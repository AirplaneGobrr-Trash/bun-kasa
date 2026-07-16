import { createCipheriv, createDecipheriv } from "node:crypto";
import { sha256 } from "./hash.ts";

function packSignedLong(value: number): Buffer {
  const buffer = Buffer.alloc(4);
  buffer.writeInt32BE(value, 0);
  return buffer;
}

/** Encryption session for the KLAP protocol, tracking the incrementing sequence number. */
export class KlapEncryptionSession {
  private readonly key: Buffer;
  private readonly iv: Buffer;
  private readonly sig: Buffer;
  private seq: number;
  private currentIvSeq: Buffer | undefined;

  constructor(localSeed: Buffer, remoteSeed: Buffer, userHash: Buffer) {
    this.key = sha256(
      Buffer.concat([Buffer.from("lsk"), localSeed, remoteSeed, userHash]),
    ).subarray(0, 16);
    const fullIv = sha256(
      Buffer.concat([Buffer.from("iv"), localSeed, remoteSeed, userHash]),
    );
    this.iv = fullIv.subarray(0, 12);
    this.seq = fullIv.readInt32BE(28);
    this.sig = sha256(
      Buffer.concat([Buffer.from("ldk"), localSeed, remoteSeed, userHash]),
    ).subarray(0, 28);
  }

  /** Encrypt the message and increment the sequence number. */
  encrypt(msg: Buffer | string): { data: Buffer; seq: number } {
    this.seq += 1;
    const ivSeq = Buffer.concat([this.iv, packSignedLong(this.seq)]);
    this.currentIvSeq = ivSeq;

    const plaintext = typeof msg === "string" ? Buffer.from(msg, "utf-8") : msg;
    const cipher = createCipheriv("aes-128-cbc", this.key, ivSeq);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const signature = sha256(
      Buffer.concat([this.sig, packSignedLong(this.seq), ciphertext]),
    );
    return { data: Buffer.concat([signature, ciphertext]), seq: this.seq };
  }

  decrypt(msg: Buffer): string {
    if (!this.currentIvSeq) {
      throw new Error("Cannot decrypt before encrypt has established a sequence number");
    }
    const decipher = createDecipheriv("aes-128-cbc", this.key, this.currentIvSeq);
    const plaintext = Buffer.concat([
      decipher.update(msg.subarray(32)),
      decipher.final(),
    ]);
    return plaintext.toString("utf-8");
  }
}
