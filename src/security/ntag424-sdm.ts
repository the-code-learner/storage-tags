import { createDecipheriv, timingSafeEqual } from "node:crypto";
import { aesCmac, nxpTruncatedMac } from "./aes-cmac.js";

export type Ntag424SdmConfig = {
  sdmFileReadKey: Buffer;
  sdmMetaReadKey?: Buffer;
  macInput?: Buffer;
};

export type Ntag424SdmInput = {
  uid?: string;
  readCounter?: string;
  encryptedPiccData?: string;
  mac: string;
};

export type Ntag424SdmResult = {
  valid: boolean;
  uid: string;
  readCounter: string;
  expectedMac: string;
  receivedMac: string;
};

function parseHex(value: string, expectedBytes?: number) {
  const compact = value.trim().replace(/^0x/i, "").replace(/[^0-9a-f]/gi, "");
  if (!compact || compact.length % 2 !== 0) throw new Error("INVALID_HEX");
  const buffer = Buffer.from(compact, "hex");
  if (expectedBytes !== undefined && buffer.length !== expectedBytes) throw new Error("INVALID_HEX_LENGTH");
  return buffer;
}

function reverseBytes(value: Buffer) {
  return Buffer.from(value).reverse();
}

function decryptPiccData(key: Buffer, encrypted: Buffer) {
  if (key.length !== 16) throw new Error("SDM_META_READ_KEY_MUST_BE_16_BYTES");
  if (encrypted.length % 16 !== 0) throw new Error("INVALID_ENCRYPTED_PICC_LENGTH");

  const decipher = createDecipheriv("aes-128-cbc", key, Buffer.alloc(16));
  decipher.setAutoPadding(false);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}

function extractPiccData(data: Buffer) {
  if (data.length < 2) throw new Error("INVALID_PICC_DATA");
  const tag = data[0];
  const uidMirrored = (tag & 0x80) !== 0;
  const counterMirrored = (tag & 0x40) !== 0;
  const uidLength = tag & 0x0f;
  let offset = 1;

  if (!uidMirrored || uidLength === 0 || data.length < offset + uidLength) throw new Error("PICC_UID_NOT_AVAILABLE");
  const uid = data.subarray(offset, offset + uidLength);
  offset += uidLength;

  if (!counterMirrored || data.length < offset + 3) throw new Error("PICC_COUNTER_NOT_AVAILABLE");
  const counterLe = data.subarray(offset, offset + 3);

  return { uid, counterLe };
}

function sessionVectorMac(uid: Buffer, counterLe: Buffer) {
  const prefix = Buffer.from("3CC300010080", "hex");
  const raw = Buffer.concat([prefix, uid, counterLe]);
  const paddingLength = (16 - (raw.length % 16)) % 16;
  return Buffer.concat([raw, Buffer.alloc(paddingLength)]);
}

export function verifyNtag424Sdm(config: Ntag424SdmConfig, input: Ntag424SdmInput): Ntag424SdmResult {
  if (config.sdmFileReadKey.length !== 16) throw new Error("SDM_FILE_READ_KEY_MUST_BE_16_BYTES");

  let uid: Buffer;
  let counterLe: Buffer;

  if (input.encryptedPiccData) {
    if (!config.sdmMetaReadKey) throw new Error("SDM_META_READ_KEY_REQUIRED");
    const plain = decryptPiccData(config.sdmMetaReadKey, parseHex(input.encryptedPiccData));
    ({ uid, counterLe } = extractPiccData(plain));
  } else {
    if (!input.uid || !input.readCounter) throw new Error("UID_AND_COUNTER_REQUIRED");
    uid = parseHex(input.uid);
    const counterMirrored = parseHex(input.readCounter, 3);
    counterLe = reverseBytes(counterMirrored);
  }

  const sessionMacKey = aesCmac(config.sdmFileReadKey, sessionVectorMac(uid, counterLe));
  const expected = nxpTruncatedMac(aesCmac(sessionMacKey, config.macInput ?? Buffer.alloc(0)));
  const received = parseHex(input.mac, 8);
  const valid = timingSafeEqual(expected, received);

  return {
    valid,
    uid: uid.toString("hex").toUpperCase(),
    readCounter: reverseBytes(counterLe).toString("hex").toUpperCase(),
    expectedMac: expected.toString("hex").toUpperCase(),
    receivedMac: received.toString("hex").toUpperCase()
  };
}
