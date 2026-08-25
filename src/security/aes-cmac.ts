import { createCipheriv } from "node:crypto";

const BLOCK_SIZE = 16;
const RB = 0x87;

function encryptBlock(key: Buffer, block: Buffer) {
  const cipher = createCipheriv("aes-128-ecb", key, null);
  cipher.setAutoPadding(false);
  return Buffer.concat([cipher.update(block), cipher.final()]);
}

function xor(left: Buffer, right: Buffer) {
  const out = Buffer.alloc(left.length);
  for (let i = 0; i < left.length; i += 1) out[i] = left[i] ^ right[i];
  return out;
}

function shiftLeft(block: Buffer) {
  const out = Buffer.alloc(block.length);
  let carry = 0;
  for (let i = block.length - 1; i >= 0; i -= 1) {
    const value = block[i];
    out[i] = ((value << 1) & 0xff) | carry;
    carry = (value & 0x80) !== 0 ? 1 : 0;
  }
  return { block: out, carry };
}

function generateSubkeys(key: Buffer) {
  const l = encryptBlock(key, Buffer.alloc(BLOCK_SIZE));
  const k1Shift = shiftLeft(l);
  const k1 = k1Shift.block;
  if (k1Shift.carry) k1[BLOCK_SIZE - 1] ^= RB;

  const k2Shift = shiftLeft(k1);
  const k2 = k2Shift.block;
  if (k2Shift.carry) k2[BLOCK_SIZE - 1] ^= RB;

  return { k1, k2 };
}

export function aesCmac(key: Buffer, message: Buffer) {
  if (key.length !== 16) throw new Error("AES_CMAC_KEY_MUST_BE_16_BYTES");

  const { k1, k2 } = generateSubkeys(key);
  const complete = message.length > 0 && message.length % BLOCK_SIZE === 0;
  const blockCount = Math.max(1, Math.ceil(message.length / BLOCK_SIZE));
  const lastStart = (blockCount - 1) * BLOCK_SIZE;
  const lastRaw = message.subarray(lastStart);

  let last: Buffer;
  if (complete) {
    last = xor(lastRaw, k1);
  } else {
    const padded = Buffer.alloc(BLOCK_SIZE);
    lastRaw.copy(padded);
    padded[lastRaw.length] = 0x80;
    last = xor(padded, k2);
  }

  let state = Buffer.alloc(BLOCK_SIZE);
  for (let index = 0; index < blockCount - 1; index += 1) {
    const block = message.subarray(index * BLOCK_SIZE, (index + 1) * BLOCK_SIZE);
    state = encryptBlock(key, xor(state, block));
  }

  return encryptBlock(key, xor(state, last));
}

export function nxpTruncatedMac(fullMac: Buffer) {
  if (fullMac.length !== 16) throw new Error("NXP_MAC_MUST_BE_16_BYTES");
  return Buffer.from(fullMac.filter((_, index) => index % 2 === 1));
}
