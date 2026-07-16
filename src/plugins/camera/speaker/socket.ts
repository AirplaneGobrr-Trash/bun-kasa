import net, { type Socket } from "node:net";

/** Ported near-verbatim from ref/camera/speaker/socket.ts. */

export const C_BOUNDARY = "--client-stream-boundary--";
export const C_SEP = "----client-stream-boundary--";
export const DEV_SEP = "----device-stream-boundary--";

export interface MpPart {
  headers: Record<string, string>;
  body: Buffer;
  rest: Buffer;
}

export function tcpConnect(host: string, port: number): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const sock = net.createConnection({ host, port }, () => resolve(sock));
    sock.once("error", reject);
  });
}

export function recvHeaders(sock: Socket): Promise<string> {
  return new Promise((resolve) => {
    let buf = Buffer.alloc(0);
    function onData(chunk: Buffer) {
      buf = Buffer.concat([buf, chunk]);
      const idx = buf.indexOf("\r\n\r\n");
      if (idx !== -1) {
        sock.removeListener("data", onData);
        sock.pause();
        resolve(buf.subarray(0, idx + 4).toString());
      }
    }
    sock.on("data", onData);
    sock.resume();
  });
}

export async function readMpPart(sock: Socket, initialBuf: Buffer): Promise<MpPart> {
  let buf = initialBuf;
  const sep = Buffer.from(DEV_SEP);

  while (buf.indexOf(sep) === -1) {
    await new Promise<void>((r) => sock.once("readable", r));
    const chunk: Buffer | null = sock.read();
    if (chunk) buf = Buffer.concat([buf, chunk]);
  }

  const idx = buf.indexOf(sep) + sep.length;
  buf = buf.subarray(idx);
  if (buf.subarray(0, 2).equals(Buffer.from("\r\n"))) buf = buf.subarray(2);

  while (buf.indexOf("\r\n\r\n") === -1) {
    await new Promise<void>((r) => sock.once("readable", r));
    const chunk: Buffer | null = sock.read();
    if (chunk) buf = Buffer.concat([buf, chunk]);
  }

  const hdrEndIdx = buf.indexOf("\r\n\r\n") + 4;
  const hdrRaw = buf.subarray(0, hdrEndIdx).toString();
  buf = buf.subarray(hdrEndIdx);

  const headers: Record<string, string> = {};
  for (const line of hdrRaw.trim().split("\r\n")) {
    const colon = line.indexOf(":");
    if (colon !== -1) {
      headers[line.slice(0, colon).trim().toLowerCase()] = line.slice(colon + 1).trim();
    }
  }

  const cl = Number.parseInt(headers["content-length"] ?? "0", 10);
  while (buf.length < cl) {
    await new Promise<void>((r) => sock.once("readable", r));
    const chunk: Buffer | null = sock.read();
    if (chunk) buf = Buffer.concat([buf, chunk]);
  }

  return { headers, body: buf.subarray(0, cl), rest: buf.subarray(cl) };
}
