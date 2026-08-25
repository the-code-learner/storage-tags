import type { TagTechnology } from "../modules/tags/tag.types.js";

export function normalizeTagIdentifier(technology: TagTechnology, raw: string) {
  const value = raw.trim();
  if (!value) return "";

  if (technology === "uhf-rain") {
    const normalized = value.replace(/^0x/i, "").replace(/[\s:_-]/g, "").toUpperCase();
    return /^[0-9A-F]+$/.test(normalized) ? normalized : "";
  }

  const compactHex = value.replace(/^0x/i, "").replace(/[\s:_-]/g, "").toUpperCase();
  if (/^[0-9A-F]+$/.test(compactHex)) return compactHex;

  return value;
}
