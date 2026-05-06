export function normalizeEpc(raw: string): string | null {
  const epc = raw.trim().toUpperCase().replace(/[^0-9A-F]/g, "");
  if (epc.length < 8 || epc.length > 64) return null;
  return epc;
}

export function extractEpcs(raw: string): string[] {
  const candidates = raw.split(/[\s,;|]+/);
  const unique = new Set<string>();

  for (const candidate of candidates) {
    const epc = normalizeEpc(candidate);
    if (epc) unique.add(epc);
  }

  return [...unique];
}
