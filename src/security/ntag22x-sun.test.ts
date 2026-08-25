import assert from "node:assert/strict";
import test from "node:test";
import { decodeNtag22xTamperMirror, verifyNtag22xSun } from "./ntag22x-sun.js";

test("NTAG 22x StatusDetect decodes stored and current tamper state", () => {
  const result = decodeNtag22xTamperMirror("CO00000000");
  assert.equal(result.data.toString("hex").toUpperCase(), "3F00000000");
  assert.equal(result.storedTamperStatus, "closed");
  assert.equal(result.currentTamperStatus, "open");
});

test("NTAG 22x SUN verifies UID, counter, tamper data and truncated CMAC", () => {
  const key = Buffer.from("000102030405060708090A0B0C0D0E0F", "hex");
  const result = verifyNtag22xSun(key, {
    uid: "04E141124C2880",
    counter: "0004AF",
    tamperMirror: "CO00000000",
    mac: "D0FDE26641C764D4"
  });

  assert.equal(result.valid, true);
  assert.equal(result.tamperData, "3F00000000");
});
