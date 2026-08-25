import assert from "node:assert/strict";
import test from "node:test";
import { createDb } from "../../db/connection.js";
import { createItemsService } from "../items/items.service.js";
import { createSessionsService } from "../sessions/sessions.service.js";
import { createTagsService } from "../tags/tags.service.js";
import { createObservationsService } from "./observations.service.js";

test("one item can aggregate RAIN and NFC observations in the same session", () => {
  const db = createDb(":memory:");
  const items = createItemsService(db);
  const tags = createTagsService(db);
  const sessions = createSessionsService(db);
  const observations = createObservationsService(db);

  const item = items.create({ name: "Mixed tag item", sku: "MIX-001" }) as { id: number };

  const uhf = tags.register({
    technology: "uhf-rain",
    identifier: "3034257BF7194E4000001A85",
    itemId: item.id,
    catalogKey: "generic-rain"
  });
  const nfc = tags.register({
    technology: "nfc",
    identifier: "04DE5F1EACC040",
    itemId: item.id,
    catalogKey: "nxp-ntag424-dna-tt"
  });
  assert.equal(uhf.ok, true);
  assert.equal(nfc.ok, true);

  const session = sessions.create({ stationKey: "test-station", containerCode: "BOX-1" }) as { session_key: string };

  assert.equal(observations.process({
    technology: "uhf-rain",
    identifier: "3034257BF7194E4000001A85",
    source: "browser-hid",
    sessionKey: session.session_key,
    stationKey: "test-station"
  }).ok, true);
  assert.equal(observations.process({
    technology: "uhf-rain",
    identifier: "3034257BF7194E4000001A85",
    source: "browser-hid",
    sessionKey: session.session_key,
    stationKey: "test-station"
  }).ok, true);
  assert.equal(observations.process({
    technology: "nfc",
    identifier: "04DE5F1EACC040",
    uid: "04DE5F1EACC040",
    source: "browser-webnfc",
    sessionKey: session.session_key,
    stationKey: "test-station",
    ndefUrl: "https://example.invalid/tag"
  }).ok, true);

  const detail = sessions.get(session.session_key) as any;
  assert.equal(detail.reads.length, 2);

  const rainRead = detail.reads.find((read: any) => read.technology === "uhf-rain");
  const nfcRead = detail.reads.find((read: any) => read.technology === "nfc");
  assert.equal(rainRead.read_count, 2);
  assert.equal(nfcRead.read_count, 1);
  assert.equal(rainRead.known_item_id, item.id);
  assert.equal(nfcRead.known_item_id, item.id);

  assert.equal(detail.events.length, 1);
  assert.equal(detail.events[0].technology, "nfc");
  assert.equal(detail.events[0].event_kind, "scan");

  db.close();
});
