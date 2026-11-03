import type { TagCapabilities, TagTechnology } from "./tag.types.js";

export type TagCatalogEntry = {
  key: string;
  label: string;
  technology: TagTechnology;
  manufacturer?: string;
  chipFamily?: string;
  chipModel?: string;
  productFamily?: string;
  partNumber?: string;
  capabilities: TagCapabilities;
  notes?: string;
};

export const tagCatalog: TagCatalogEntry[] = [
  { key: "generic-nfc-ndef", label: "Generic NFC / NDEF", technology: "nfc", capabilities: { ndef: true } },
  { key: "generic-rain", label: "Generic RAIN / UHF", technology: "uhf-rain", capabilities: { bulkInventory: true } },
  {
    key: "nxp-ntag223-dna",
    label: "NXP NTAG 223 DNA",
    technology: "nfc",
    manufacturer: "NXP",
    chipFamily: "NTAG 22x DNA",
    chipModel: "NTAG 223 DNA",
    capabilities: { ndef: true, sun: true, passwordProtectedMemory: true }
  },
  {
    key: "nxp-ntag224-dna",
    label: "NXP NTAG 224 DNA",
    technology: "nfc",
    manufacturer: "NXP",
    chipFamily: "NTAG 22x DNA",
    chipModel: "NTAG 224 DNA",
    capabilities: { ndef: true, sun: true, mutualAuth: true, aesProtectedMemory: true }
  },
  {
    key: "nxp-ntag223-dna-statusdetect",
    label: "NXP NTAG 223 DNA StatusDetect",
    technology: "nfc",
    manufacturer: "NXP",
    chipFamily: "NTAG 22x DNA StatusDetect",
    chipModel: "NTAG 223 DNA StatusDetect",
    capabilities: { ndef: true, sun: true, passwordProtectedMemory: true, tamper: true, currentTamperStatus: true, statusDetect: true, sensor: true }
  },
  {
    key: "nxp-ntag224-dna-statusdetect",
    label: "NXP NTAG 224 DNA StatusDetect",
    technology: "nfc",
    manufacturer: "NXP",
    chipFamily: "NTAG 22x DNA StatusDetect",
    chipModel: "NTAG 224 DNA StatusDetect",
    capabilities: { ndef: true, sun: true, mutualAuth: true, aesProtectedMemory: true, tamper: true, currentTamperStatus: true, statusDetect: true, sensor: true }
  },
  {
    key: "nxp-ntag424-dna",
    label: "NXP NTAG 424 DNA",
    technology: "nfc",
    manufacturer: "NXP",
    chipFamily: "NTAG 424 DNA",
    chipModel: "NTAG 424 DNA",
    capabilities: { ndef: true, sun: true, sdm: true, mutualAuth: true, aesProtectedMemory: true, secureMessaging: true }
  },
  {
    key: "nxp-ntag424-dna-tt",
    label: "NXP NTAG 424 DNA TagTamper",
    technology: "nfc",
    manufacturer: "NXP",
    chipFamily: "NTAG 424 DNA",
    chipModel: "NTAG 424 DNA TagTamper",
    capabilities: { ndef: true, sun: true, sdm: true, mutualAuth: true, aesProtectedMemory: true, secureMessaging: true, tamper: true, currentTamperStatus: true, permanentTamperStatus: true }
  },
  {
    key: "identiv-ntag223-dna-statusdetect-conductive",
    label: "Identiv NTAG 223 DNA StatusDetect — conductive",
    technology: "nfc",
    manufacturer: "Identiv / NXP",
    chipFamily: "NTAG 22x DNA StatusDetect",
    chipModel: "NTAG 223 DNA StatusDetect",
    productFamily: "Identiv NTAG 22x DNA Portfolio",
    partNumber: "LA1XADNW9025",
    capabilities: { ndef: true, sun: true, passwordProtectedMemory: true, tamper: true, currentTamperStatus: true, statusDetect: true }
  },
  {
    key: "identiv-ntag223-dna-statusdetect-capacitive",
    label: "Identiv NTAG 223 DNA StatusDetect — capacitive",
    technology: "nfc",
    manufacturer: "Identiv / NXP",
    chipFamily: "NTAG 22x DNA StatusDetect",
    chipModel: "NTAG 223 DNA StatusDetect",
    productFamily: "Identiv NTAG 22x DNA Portfolio",
    partNumber: "LA1XADNW9B25",
    capabilities: { ndef: true, sun: true, passwordProtectedMemory: true, statusDetect: true, sensor: true }
  },
  {
    key: "identiv-ntag224-dna",
    label: "Identiv NTAG 224 DNA",
    technology: "nfc",
    manufacturer: "Identiv / NXP",
    chipFamily: "NTAG 22x DNA",
    chipModel: "NTAG 224 DNA",
    productFamily: "Identiv NTAG 22x DNA Portfolio",
    partNumber: "LA1PADNX9025",
    capabilities: { ndef: true, sun: true, mutualAuth: true, aesProtectedMemory: true }
  },
  {
    key: "identiv-id-nxp-ntag424dna-tt",
    label: "Identiv ID-NXP NTAG 424 DNA TT",
    technology: "nfc",
    manufacturer: "Identiv / NXP",
    chipFamily: "NTAG 424 DNA",
    chipModel: "NTAG 424 DNA TagTamper",
    productFamily: "ID-NXP NTAG 424 DNA TT",
    capabilities: { ndef: true, sun: true, sdm: true, mutualAuth: true, aesProtectedMemory: true, secureMessaging: true, tamper: true, currentTamperStatus: true, permanentTamperStatus: true },
    notes: "Exact inlay/label part number is selected after sample inspection."
  },
  {
    key: "nxp-ucode-dna",
    label: "NXP UCODE DNA",
    technology: "uhf-rain",
    manufacturer: "NXP",
    chipFamily: "UCODE DNA",
    chipModel: "UCODE DNA",
    capabilities: { bulkInventory: true, uhfAesAuth: true, readerChallengeResponse: true }
  },
  {
    key: "nxp-ucode-dna-track",
    label: "NXP UCODE DNA Track",
    technology: "uhf-rain",
    manufacturer: "NXP",
    chipFamily: "UCODE DNA",
    chipModel: "UCODE DNA Track",
    capabilities: { bulkInventory: true, uhfAesAuth: true, readerChallengeResponse: true }
  },
  {
    key: "nxp-ucode-guard",
    label: "NXP UCODE Guard",
    technology: "uhf-rain",
    manufacturer: "NXP",
    chipFamily: "UCODE Guard",
    chipModel: "UCODE Guard",
    capabilities: { bulkInventory: true, uhfAesAuth: true, readerChallengeResponse: true },
    notes: "Tracked alongside UCODE DNA as a secure RAIN authentication family."
  }
];

export function getCatalogEntry(key?: string) {
  return key ? tagCatalog.find((entry) => entry.key === key) : undefined;
}
