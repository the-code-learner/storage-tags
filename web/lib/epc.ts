export function normalizeEpc(raw: string): string | null {
  const epc = raw.trim().toUpperCase().replace(/[^0-9A-F]/g, "");
  if (epc.length < 8 || epc.length > 64) return null;
  return epc;
}

export function extractEpcs(raw: string): string[] {
  const unique = new Set<string>();
  for (const value of raw.split(/[\s,;|]+/)) {
    const epc = normalizeEpc(value);
    if (epc) unique.add(epc);
  }
  return [...unique];
}

export function confidenceLabel(readCount: number): string {
  if (readCount >= 3) return "High";
  if (readCount === 2) return "Medium";
  return "Low";
}
