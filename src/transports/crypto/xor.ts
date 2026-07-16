const INITIALIZATION_VECTOR = 171;

/** XOR-cipher a plaintext payload (no length prefix). */
export function xorEncryptPayload(plainBytes: Buffer): Buffer {
  const cipherBytes = Buffer.alloc(plainBytes.length);
  let key = INITIALIZATION_VECTOR;
  for (let i = 0; i < plainBytes.length; i++) {
    key ^= plainBytes[i] as number;
    cipherBytes[i] = key;
  }
  return cipherBytes;
}

/** XOR-decipher a ciphertext payload (no length prefix). */
export function xorDecryptPayload(ciphertext: Buffer): Buffer {
  const plainBytes = Buffer.alloc(ciphertext.length);
  let key = INITIALIZATION_VECTOR;
  for (let i = 0; i < ciphertext.length; i++) {
    const cipherByte = ciphertext[i] as number;
    plainBytes[i] = key ^ cipherByte;
    key = cipherByte;
  }
  return plainBytes;
}

/** Encrypt a request for a legacy (XOR) TP-Link Smart Home device, with a 4-byte length prefix. */
export function xorEncrypt(request: string): Buffer {
  const plainBytes = Buffer.from(request, "utf-8");
  const cipherBytes = xorEncryptPayload(plainBytes);
  const lengthPrefix = Buffer.alloc(4);
  lengthPrefix.writeUInt32BE(plainBytes.length, 0);
  return Buffer.concat([lengthPrefix, cipherBytes]);
}

/** Decrypt a response from a legacy (XOR) TP-Link Smart Home device. */
export function xorDecrypt(ciphertext: Buffer): string {
  return xorDecryptPayload(ciphertext).toString("utf-8");
}
