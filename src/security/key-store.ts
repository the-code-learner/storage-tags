import fs from "node:fs";
import path from "node:path";

export function resolveKeysDir() {
  return path.resolve(process.env.STORAGE_TAGS_KEYS_DIR ?? "/run/secrets/storage-tags");
}

export function loadAes128Key(keyRef: string) {
  if (!keyRef.trim()) throw new Error("KEY_REF_REQUIRED");
  // Key references are file names, not paths. Never allow a profile to address
  // arbitrary files outside the operator-managed secret directory.
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(keyRef) || keyRef === "." || keyRef === "..") {
    throw new Error("INVALID_KEY_REF");
  }

  const filePath = path.join(resolveKeysDir(), keyRef);
  // O_NOFOLLOW prevents the final path component from resolving through a
  // symlink; fstat ensures the target is a regular file, not a device or pipe.
  const descriptor = fs.openSync(filePath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  let data: Buffer;
  try {
    if (!fs.fstatSync(descriptor).isFile()) throw new Error("KEY_FILE_NOT_REGULAR");
    data = fs.readFileSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }

  if (data.length === 16) return data;

  const text = data.toString("utf-8").trim().replace(/^0x/i, "").replace(/\s+/g, "");
  if (!/^[0-9a-fA-F]{32}$/.test(text)) throw new Error("AES_KEY_FILE_MUST_CONTAIN_16_RAW_BYTES_OR_32_HEX_CHARS");
  return Buffer.from(text, "hex");
}
