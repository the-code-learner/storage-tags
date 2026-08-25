export type TagTechnology = "uhf-rain" | "nfc";
export type TagStatus = "active" | "inactive" | "ignored" | "external";
export type AuthStatus = "not-requested" | "pending" | "verified" | "failed" | "replay" | "unsupported" | "error";
export type TamperStatus = "unknown" | "sealed" | "open" | "closed" | "opened-once" | "invalid";
export type TagReadSource = "browser-hid" | "browser-webnfc" | "reader-bridge" | "mock";

export type TagCapabilities = {
  ndef?: boolean;
  sun?: boolean;
  sdm?: boolean;
  mutualAuth?: boolean;
  passwordProtectedMemory?: boolean;
  aesProtectedMemory?: boolean;
  secureMessaging?: boolean;
  tamper?: boolean;
  currentTamperStatus?: boolean;
  permanentTamperStatus?: boolean;
  statusDetect?: boolean;
  sensor?: boolean;
  bulkInventory?: boolean;
  uhfAesAuth?: boolean;
  readerChallengeResponse?: boolean;
};

export type TagObservationInput = {
  technology: TagTechnology;
  identifier: string;
  epc?: string;
  tid?: string;
  uid?: string;
  source: TagReadSource;
  stationKey?: string;
  sessionKey?: string;
  rssi?: number;
  antenna?: number;
  raw?: string;
  ndefUrl?: string;
  payload?: Record<string, unknown>;
  authStatus?: AuthStatus;
  authCounter?: number;
  tamperStatus?: TamperStatus;
  permanentTamperStatus?: TamperStatus;
  sensorValue?: number;
  sensorUnit?: string;
  seenAt?: string;
};

export type RegisterTagInput = {
  technology: TagTechnology;
  identifier: string;
  itemId?: number;
  epc?: string;
  tid?: string;
  uid?: string;
  catalogKey?: string;
  manufacturer?: string;
  chipFamily?: string;
  chipModel?: string;
  productFamily?: string;
  partNumber?: string;
  securityProfileKey?: string;
  capabilities?: TagCapabilities;
  metadata?: Record<string, unknown>;
  status?: TagStatus;
};
