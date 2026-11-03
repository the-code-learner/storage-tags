import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { loadAes128Key } from "./key-store.js";

test("AES key storage accepts raw and hex files but refuses unsafe references", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "storage-tags-keys-"));
  const previous = process.env.STORAGE_TAGS_KEYS_DIR;
  try {
    process.env.STORAGE_TAGS_KEYS_DIR = dir;
    const key = Buffer.from("00112233445566778899AABBCCDDEEFF", "hex");
    fs.writeFileSync(path.join(dir, "raw.key"), key);
    fs.writeFileSync(path.join(dir, "hex.key"), "0x00112233445566778899aabbccddeeff\n");
    assert.deepEqual(loadAes128Key("raw.key"), key);
    assert.deepEqual(loadAes128Key("hex.key"), key);
    for (const ref of ["../outside", "/etc/passwd", "nested/key", ".", "..", " raw.key", ""]) {
      assert.throws(() => loadAes128Key(ref));
    }
    fs.writeFileSync(path.join(dir, "bad.key"), "not-a-key");
    assert.throws(() => loadAes128Key("bad.key"), /AES_KEY_FILE_MUST/);
    fs.symlinkSync(path.join(dir, "raw.key"), path.join(dir, "linked.key"));
    assert.throws(() => loadAes128Key("linked.key"));
    fs.mkdirSync(path.join(dir, "directory.key"));
    assert.throws(() => loadAes128Key("directory.key"), /KEY_FILE_NOT_REGULAR/);
  } finally {
    if (previous === undefined) delete process.env.STORAGE_TAGS_KEYS_DIR;
    else process.env.STORAGE_TAGS_KEYS_DIR = previous;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
