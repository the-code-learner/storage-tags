import type { AppDb } from "../../db/connection.js";
import { loadAes128Key } from "../../security/key-store.js";
import { verifyNtag22xSun } from "../../security/ntag22x-sun.js";
import { verifyNtag424Sdm } from "../../security/ntag424-sdm.js";
import { normalizeTagIdentifier } from "../../utils/normalize-tag.js";
import { nowIso } from "../../utils/time.js";
import { createObservationsService } from "../observations/observations.service.js";
import type { AuthStatus, TagReadSource, TagTechnology, TamperStatus } from "../tags/tag.types.js";

export type SecurityVerifier = "ntag22x-sun" | "ntag424-sdm" | "reader-bridge";

export type SecurityProfileInput = {
  profileKey: string;
  name: string;
  technology: TagTechnology;
  verifier: SecurityVerifier;
  keyRef?: string;
  config?: Record<string, unknown>;
  status?: "active" | "inactive";
};

export type VerifyInput = {
  technology: TagTechnology;
  identifier: string;
  profileKey?: string;
  url?: string;
  source?: TagReadSource;
  stationKey?: string;
  sessionKey?: string;
  evidence?: Record<string, unknown>;
};

type StoredProfile = {
  id: number;
  profile_key: string;
  name: string;
  technology: TagTechnology;
  verifier: SecurityVerifier;
  key_ref: string | null;
  config_json: string | null;
  status: string;
};

function configOf(profile: StoredProfile) {
  if (!profile.config_json) return {} as Record<string, any>;
  try {
    return JSON.parse(profile.config_json) as Record<string, any>;
  } catch {
    throw new Error("INVALID_SECURITY_PROFILE_CONFIG");
  }
}

function queryValue(url: URL, config: Record<string, any>, configKey: string, fallback: string) {
  const name = typeof config[configKey] === "string" ? config[configKey] : fallback;
  return url.searchParams.get(name) ?? undefined;
}

function tamperFromValue(value: string | undefined, map: Record<string, unknown> | undefined): TamperStatus {
  if (!value || !map) return "unknown";
  const mapped = map[value];
  if (["unknown", "sealed", "open", "closed", "opened-once", "invalid"].includes(String(mapped))) return mapped as TamperStatus;
  return "unknown";
}

function parseCounter(counterHex: string) {
  const value = Number.parseInt(counterHex, 16);
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("INVALID_AUTH_COUNTER");
  return value;
}

export function createSecurityService(db: AppDb) {
  const observations = createObservationsService(db);

  function getProfile(profileKey: string) {
    return db.prepare(`
      SELECT id, profile_key, name, technology, verifier, key_ref, config_json, status
      FROM tag_security_profiles
      WHERE profile_key = ?
    `).get(profileKey) as StoredProfile | undefined;
  }

  return {
    listProfiles() {
      return db.prepare(`
        SELECT profile_key, name, technology, verifier, key_ref, config_json, status, created_at, updated_at
        FROM tag_security_profiles
        ORDER BY name, profile_key
      `).all();
    },

    upsertProfile(input: SecurityProfileInput) {
      const timestamp = nowIso();
      db.prepare(`
        INSERT INTO tag_security_profiles (
          profile_key, name, technology, verifier, key_ref, config_json, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(profile_key) DO UPDATE SET
          name = excluded.name,
          technology = excluded.technology,
          verifier = excluded.verifier,
          key_ref = excluded.key_ref,
          config_json = excluded.config_json,
          status = excluded.status,
          updated_at = excluded.updated_at
      `).run(
        input.profileKey,
        input.name,
        input.technology,
        input.verifier,
        input.keyRef ?? null,
        input.config ? JSON.stringify(input.config) : null,
        input.status ?? "active",
        timestamp,
        timestamp
      );
      return getProfile(input.profileKey);
    },

    verify(input: VerifyInput) {
      const identifier = normalizeTagIdentifier(input.technology, input.identifier);
      if (!identifier) return { ok: false as const, error: "INVALID_IDENTIFIER" as const };

      const tag = db.prepare(`
        SELECT tags.*, tag_security_profiles.profile_key
        FROM tags
        LEFT JOIN tag_security_profiles ON tag_security_profiles.id = tags.security_profile_id
        WHERE tags.technology = ? AND tags.identifier = ? AND tags.status = 'active'
      `).get(input.technology, identifier) as any;
      if (!tag) return { ok: false as const, error: "TAG_NOT_FOUND" as const };

      const profileKey = input.profileKey ?? tag.profile_key;
      if (!profileKey) {
        const observation = observations.process({
          technology: input.technology,
          identifier,
          source: input.source ?? "browser-webnfc",
          stationKey: input.stationKey,
          sessionKey: input.sessionKey,
          authStatus: "unsupported",
          ndefUrl: input.url,
          payload: { reason: "SECURITY_PROFILE_REQUIRED" }
        });
        return { ok: true as const, verified: false, authStatus: "unsupported" as AuthStatus, observation };
      }

      const profile = getProfile(profileKey);
      if (!profile || profile.status !== "active") return { ok: false as const, error: "SECURITY_PROFILE_NOT_FOUND" as const };
      if (profile.technology !== input.technology) return { ok: false as const, error: "SECURITY_PROFILE_TECHNOLOGY_MISMATCH" as const };

      if (profile.verifier === "reader-bridge") {
        const observation = observations.process({
          technology: input.technology,
          identifier,
          source: input.source ?? "reader-bridge",
          stationKey: input.stationKey,
          sessionKey: input.sessionKey,
          authStatus: "unsupported",
          payload: { reason: "AUTHENTICATED_READER_BRIDGE_REQUIRED", profileKey }
        });
        return { ok: true as const, verified: false, authStatus: "unsupported" as AuthStatus, observation };
      }

      if (!profile.key_ref) return { ok: false as const, error: "SECURITY_KEY_REF_REQUIRED" as const };
      if (!input.url) return { ok: false as const, error: "NDEF_URL_REQUIRED" as const };

      const url = new URL(input.url);
      const config = configOf(profile);
      const key = loadAes128Key(profile.key_ref);
      let cryptoValid = false;
      let counterHex = "";
      let uid = "";
      let currentTamper: TamperStatus = "unknown";
      let permanentTamper: TamperStatus = "unknown";
      let details: Record<string, unknown> = {};

      if (profile.verifier === "ntag22x-sun") {
        const uidValue = queryValue(url, config, "uidParam", "uid");
        const counterValue = queryValue(url, config, "counterParam", "ctr");
        const macValue = queryValue(url, config, "macParam", "cmac") ?? queryValue(url, config, "macParam", "c");
        const tamperValue = queryValue(url, config, "tamperParam", "tt");
        if (!uidValue || !counterValue || !macValue) return { ok: false as const, error: "SUN_PARAMETERS_REQUIRED" as const };

        const result = verifyNtag22xSun(key, { uid: uidValue, counter: counterValue, mac: macValue, tamperMirror: tamperValue });
        cryptoValid = result.valid;
        counterHex = result.counter;
        uid = result.uid;
        currentTamper = result.currentTamperStatus === "open" ? "open" : result.currentTamperStatus === "closed" ? "closed" : result.currentTamperStatus === "invalid" ? "invalid" : "unknown";
        permanentTamper = result.storedTamperStatus === "open" ? "opened-once" : result.storedTamperStatus === "closed" ? "closed" : result.storedTamperStatus === "invalid" ? "invalid" : "unknown";
        details = { expectedMac: result.expectedMac, receivedMac: result.receivedMac, tamperData: result.tamperData };
      } else {
        const uidValue = queryValue(url, config, "uidParam", "uid");
        const counterValue = queryValue(url, config, "counterParam", "ctr");
        const encryptedPiccData = queryValue(url, config, "encryptedPiccParam", "e");
        const macValue = queryValue(url, config, "macParam", "c");
        if (!macValue || (!encryptedPiccData && (!uidValue || !counterValue))) return { ok: false as const, error: "SDM_PARAMETERS_REQUIRED" as const };

        const metaKeyRef = typeof config.metaKeyRef === "string" ? config.metaKeyRef : undefined;
        const result = verifyNtag424Sdm({
          sdmFileReadKey: key,
          sdmMetaReadKey: encryptedPiccData && metaKeyRef ? loadAes128Key(metaKeyRef) : undefined,
          macInput: typeof config.macInputHex === "string" ? Buffer.from(config.macInputHex, "hex") : undefined
        }, {
          uid: uidValue,
          readCounter: counterValue,
          encryptedPiccData,
          mac: macValue
        });
        cryptoValid = result.valid;
        counterHex = result.readCounter;
        uid = result.uid;
        currentTamper = tamperFromValue(queryValue(url, config, "currentTamperParam", "tt"), config.tamperValueMap);
        permanentTamper = tamperFromValue(queryValue(url, config, "permanentTamperParam", "ttp"), config.permanentTamperValueMap ?? config.tamperValueMap);
        details = { expectedMac: result.expectedMac, receivedMac: result.receivedMac };
      }

      const authCounter = parseCounter(counterHex);
      const replay = cryptoValid && tag.last_auth_counter !== null && tag.last_auth_counter !== undefined && authCounter <= Number(tag.last_auth_counter);
      const authStatus: AuthStatus = !cryptoValid ? "failed" : replay ? "replay" : "verified";

      const observation = observations.process({
        technology: input.technology,
        identifier,
        uid,
        source: input.source ?? "browser-webnfc",
        stationKey: input.stationKey,
        sessionKey: input.sessionKey,
        authStatus,
        authCounter: cryptoValid && !replay ? authCounter : undefined,
        tamperStatus: currentTamper,
        permanentTamperStatus: permanentTamper,
        ndefUrl: input.url,
        payload: {
          profileKey,
          verifier: profile.verifier,
          counter: counterHex,
          replay,
          ...details
        }
      });

      return {
        ok: true as const,
        verified: authStatus === "verified",
        authStatus,
        replay,
        counter: counterHex,
        uid,
        tamperStatus: currentTamper,
        permanentTamperStatus: permanentTamper,
        profileKey,
        observation
      };
    }
  };
}
