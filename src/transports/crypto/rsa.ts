import { constants, generateKeyPairSync, privateDecrypt } from "node:crypto";

const RSA_PKCS1_OAEP_PADDING_SHA1 = {
  padding: constants.RSA_PKCS1_OAEP_PADDING,
  oaepHash: "sha1",
};

/** RSA key pair used for the AES (Tapo) transport handshake. */
export class KeyPair {
  readonly privateKeyDerB64: string;
  readonly publicKeyDerB64: string;
  private readonly privateKeyPem: string;
  readonly publicKeyPem: string;

  private constructor(
    privateKeyPem: string,
    publicKeyPem: string,
    privateKeyDer: Buffer,
    publicKeyDer: Buffer,
  ) {
    this.privateKeyPem = privateKeyPem;
    this.publicKeyPem = publicKeyPem;
    this.privateKeyDerB64 = privateKeyDer.toString("base64");
    this.publicKeyDerB64 = publicKeyDer.toString("base64");
  }

  static createKeyPair(keySize = 1024): KeyPair {
    const { publicKey, privateKey } = generateKeyPairSync("rsa", {
      modulusLength: keySize,
      publicExponent: 0x10001,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });

    const privateKeyDer = pemToDer(privateKey, "PRIVATE KEY");
    const publicKeyDer = pemToDer(publicKey, "PUBLIC KEY");
    return new KeyPair(privateKey, publicKey, privateKeyDer, publicKeyDer);
  }

  static createFromDerKeys(privateKeyDerB64: string, publicKeyDerB64: string): KeyPair {
    const privateKeyPem = derToPem(
      Buffer.from(privateKeyDerB64, "base64"),
      "PRIVATE KEY",
    );
    const publicKeyPem = derToPem(Buffer.from(publicKeyDerB64, "base64"), "PUBLIC KEY");
    return new KeyPair(
      privateKeyPem,
      publicKeyPem,
      Buffer.from(privateKeyDerB64, "base64"),
      Buffer.from(publicKeyDerB64, "base64"),
    );
  }

  getPublicPem(): string {
    return this.publicKeyPem;
  }

  /** Decrypt an AES handshake key encrypted with RSA PKCS#1 v1.5. */
  decryptHandshakeKey(encryptedKey: Buffer): Buffer {
    return privateDecrypt(
      { key: this.privateKeyPem, padding: constants.RSA_PKCS1_PADDING },
      encryptedKey,
    );
  }

  /** Decrypt an AES discovery key (port 20002) encrypted with RSA-OAEP/SHA1. */
  decryptDiscoveryKey(encryptedKey: Buffer): Buffer {
    return privateDecrypt(
      { key: this.privateKeyPem, ...RSA_PKCS1_OAEP_PADDING_SHA1 },
      encryptedKey,
    );
  }
}

function pemToDer(pem: string, label: string): Buffer {
  const base64 = pem
    .replace(`-----BEGIN ${label}-----`, "")
    .replace(`-----END ${label}-----`, "")
    .replace(/\s/g, "");
  return Buffer.from(base64, "base64");
}

function derToPem(der: Buffer, label: string): string {
  const base64 = der.toString("base64");
  const lines = base64.match(/.{1,64}/g) ?? [];
  return `-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----\n`;
}
