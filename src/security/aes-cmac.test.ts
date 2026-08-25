import assert from "node:assert/strict";
import test from "node:test";
import { aesCmac, nxpTruncatedMac } from "./aes-cmac.js";

test("AES-CMAC matches RFC 4493 vector", () => {
  const key = Buffer.from("2B7E151628AED2A6ABF7158809CF4F3C", "hex");
  const mac = aesCmac(key, Buffer.alloc(0));
  assert.equal(mac.toString("hex").toUpperCase(), "BB1D6929E95937287FA37D129B756746");
});

test("NXP truncation keeps alternating CMAC bytes", () => {
  const full = Buffer.from("E194C7EE12D9F7EE8A65C8331B704386", "hex");
  assert.equal(nxpTruncatedMac(full).toString("hex").toUpperCase(), "94EED9EE65337086");
});
