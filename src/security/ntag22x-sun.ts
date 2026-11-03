import { timingSafeEqual } from "node:crypto";
import { aesCmac, nxpTruncatedMac } from "./aes-cmac.js";

export type Ntag22xSunInput = {
  uid: string;
  counter: string;
  mac: string;
  tamperMirror?: string;
};

export type Ntag22xSunResult = {
  valid: boolean;
  uid: string;
  counter: string;
  expectedMac: string;
  receivedMac: string;
  storedTamperStatus?: "closed" | "open" | "invalid" | "hidden";
  currentTamperStatus?: "closed" | "open" | "invalid" | "hidden";
  tamperData?: string;
};

function parseHex(value: string, expectedBytes?: number) {
  const compact = value.trim().replace(/^0x/i, "").replace(/[^0-9a-f]/gi, "").toUpperCase();
  if (!compact || compact.length % 2 !== 0) throw new Error("INVALID_HEX");
  const data = Buffer.from(compact, "hex");
  if (expectedBytes !== undefined && data.length !== expectedBytes) throw new Error("INVALID_HEX_LENGTH");
  return data;
}

function statusNibble(char: string) {
  switch (char.toUpperCase()) {
    case "C": return 0x3;
    case "O": return 0xf;
    case "I": return 0x9;
    case "0": return 0x0;
    default: throw new Error("INVALID_TAMPER_STATUS");
  }
}

function tamperStatus(nibble: number): "closed" | "open" | "invalid" | "hidden" {
  if (nibble === 0x3) return "closed";
  if (nibble === 0xf) return "open";
  if (nibble === 0x9) return "invalid";
  return "hidden";
}

export function decodeNtag22xTamperMirror(value: string) {
  const compact = value.trim().toUpperCase();
  if (compact.length !== 10) throw new Error("TAMPER_MIRROR_MUST_BE_10_CHARACTERS");
  if (!/^[COI0][COI0][0-9A-F]{8}$/.test(compact)) throw new Error("INVALID_TAMPER_MIRROR");

  const firstByte = (statusNibble(compact[0]) << 4) | statusNibble(compact[1]);
  const tail = Buffer.from(compact.slice(2), "hex");
  const data = Buffer.concat([Buffer.from([firstByte]), tail]);

  return {
    data,
    storedTamperStatus: tamperStatus(firstByte >> 4),
    currentTamperStatus: tamperStatus(firstByte & 0x0f)
  };
}

export function verifyNtag22xSun(key: Buffer, input: Ntag22xSunInput): Ntag22xSunResult {
  if (key.length !== 16) throw new Error("SUN_KEY_MUST_BE_16_BYTES");

  const uid = parseHex(input.uid, 7);
  const counter = parseHex(input.counter, 3);
  const tamper = input.tamperMirror ? decodeNtag22xTamperMirror(input.tamperMirror) : undefined;
  const dynamicSunData = Buffer.concat([uid, counter, tamper?.data ?? Buffer.alloc(0)]);
  const expected = nxpTruncatedMac(aesCmac(key, dynamicSunData));
  const received = parseHex(input.mac, 8);

  return {
    valid: timingSafeEqual(expected, received),
    uid: uid.toString("hex").toUpperCase(),
    counter: counter.toString("hex").toUpperCase(),
    expectedMac: expected.toString("hex").toUpperCase(),
    receivedMac: received.toString("hex").toUpperCase(),
    storedTamperStatus: tamper?.storedTamperStatus,
    currentTamperStatus: tamper?.currentTamperStatus,
    tamperData: tamper?.data.toString("hex").toUpperCase()
  };
}
