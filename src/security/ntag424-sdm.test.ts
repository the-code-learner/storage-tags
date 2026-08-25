import assert from "node:assert/strict";
import test from "node:test";
import { verifyNtag424Sdm } from "./ntag424-sdm.js";

test("NTAG 424 DNA verifies the NXP encrypted PICC SDM example", () => {
  const zeroKey = Buffer.alloc(16);
  const result = verifyNtag424Sdm({
    sdmFileReadKey: zeroKey,
    sdmMetaReadKey: zeroKey
  }, {
    encryptedPiccData: "EF963FF7828658A599F3041510671E88",
    mac: "94EED9EE65337086"
  });

  assert.equal(result.valid, true);
  assert.equal(result.uid, "04DE5F1EACC040");
  assert.equal(result.readCounter, "00003D");
  assert.equal(result.expectedMac, "94EED9EE65337086");
});
