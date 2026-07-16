import { derivePassword, digestAuth } from "./auth.ts";
import { tsHeader } from "./mpegts.ts";
import { C_BOUNDARY, C_SEP, readMpPart, recvHeaders, tcpConnect } from "./socket.ts";

/** Ported near-verbatim from ref/camera/speaker/camera.ts's runCamera(). */

const PORT = 8800;
const USER = "admin";

export type WriteFrame = (tsData: Buffer) => void;

export async function runTalkChannel(
  host: string,
  cloudPass: string,
  onReady: (write: WriteFrame) => void,
  onDisconnect?: () => void,
): Promise<void> {
  // step 1: probe -> 401, grab digest challenge
  let sock = await tcpConnect(host, PORT);
  sock.write(
    `POST /stream HTTP/1.1\r\nHost: ${host}:${PORT}\r\nContent-Type: multipart/mixed; boundary=${C_BOUNDARY}\r\n\r\n`,
  );
  const r1 = await recvHeaders(sock);
  sock.destroy();

  if (!r1.includes("401")) {
    throw new Error(
      `[${host}] expected 401 probing talk channel, got: ${r1.split("\r\n")[0]}`,
    );
  }

  const wwwLine =
    r1.split("\r\n").find((l) => l.toLowerCase().startsWith("www-authenticate:")) ?? "";
  const ch: Record<string, string> = {};
  for (const m of wwwLine.matchAll(/(\w+)=(?:"([^"]*)"|(\S+))/g)) {
    if (m[1]) ch[m[1]] = m[2] ?? m[3] ?? "";
  }

  const {
    realm = "",
    nonce = "",
    qop = "auth",
    opaque = "",
    encrypt_type: enc = "",
  } = ch;

  const pw = derivePassword(cloudPass, enc);
  const auth = digestAuth(USER, pw, realm, nonce, qop, opaque);

  // step 2: authenticated POST — keep connection open
  sock = await tcpConnect(host, PORT);
  sock.setKeepAlive(true, 5000);
  sock.on("error", () => {
    sock.destroy();
  });
  sock.write(
    `POST /stream HTTP/1.1\r\nHost: ${host}:${PORT}\r\nContent-Type: multipart/mixed; boundary=${C_BOUNDARY}\r\nAuthorization: ${auth}\r\n\r\n`,
  );
  sock.pause();

  const r2 = await recvHeaders(sock);
  if (!r2.includes("200")) {
    sock.destroy();
    throw new Error(`[${host}] talk channel auth failed: ${r2.split("\r\n")[0]}`);
  }

  // step 3: talk request -> session_id
  const talkJson = Buffer.from(
    JSON.stringify({
      type: "request",
      seq: 3,
      params: { talk: { mode: "aec" }, method: "get" },
    }),
  );
  sock.write(
    Buffer.concat([
      Buffer.from(
        `${C_SEP}\r\nContent-Type: application/json\r\nContent-Length: ${talkJson.length}\r\n\r\n`,
      ),
      talkJson,
      Buffer.from("\r\n"),
    ]),
  );

  const { body } = await readMpPart(sock, Buffer.alloc(0));
  const sessionId = String(
    (JSON.parse(body.toString()) as { params: { session_id: unknown } }).params
      .session_id,
  );

  // step 4: PAT+PMT header (sent once)
  const hdrTs = tsHeader();
  sock.write(
    Buffer.concat([
      Buffer.from(
        `${C_SEP}\r\nContent-Type: audio/mp2t\r\nX-If-Encrypt: 0\r\nX-Session-Id: ${sessionId}\r\nContent-Length: ${hdrTs.length}\r\n\r\n`,
      ),
      hdrTs,
    ]),
  );

  // step 5: expose write function to caller
  onReady((tsData: Buffer) => {
    sock.write(
      Buffer.concat([
        Buffer.from(
          `${C_SEP}\r\nContent-Type: audio/mp2t\r\nX-If-Encrypt: 0\r\nX-Session-Id: ${sessionId}\r\nContent-Length: ${tsData.length}\r\n\r\n`,
        ),
        tsData,
      ]),
    );
  });

  sock.once("close", () => {
    onDisconnect?.();
  });
}
