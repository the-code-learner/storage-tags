import fs from "node:fs";
import path from "node:path";

export function resolveKeysDir() {
  return path.resolve(process.env.STORAGE_TAGS_KEYS_DIR ?? "/run/secrets/storage-tags");
}

export function loadAes128Key(keyRef: string) {
  if (!keyRef.trim()) throw new Error("KEY_REF_REQUIRED");

  const base = resolveKeysDir();
  const filePath = path.resolve(base, keyRef);
  const relative = path.relative(base, filePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("INVALID_KEY_REF");

  const data = fs.readFileSync(filePath);
  if (data.length === 16) return data;

  const text = data.toString("utf-8").trim().replace(/^0x/i, "").replace(/\s+/g, "");
  if (!/^[0-9a-fA-F]{32}$/.test(text)) throw new Error("AES_KEY_FILE_MUST_CONTAIN_16_RAW_BYTES_OR_32_HEX_CHARS");
  return Buffer.from(text, "hex");
}
