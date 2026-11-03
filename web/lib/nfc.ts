export type WebNfcRead = {
  serialNumber: string;
  url?: string;
  records: { recordType: string; mediaType?: string; text?: string }[];
};

type NdefRecordLike = {
  recordType: string;
  mediaType?: string;
  data?: DataView;
};

type NdefReadingEventLike = Event & {
  serialNumber?: string;
  message: { records: NdefRecordLike[] };
};

type NdefReaderLike = EventTarget & {
  scan(options?: { signal?: AbortSignal }): Promise<void>;
};

type NdefReaderConstructor = new () => NdefReaderLike;

function decodeRecord(record: NdefRecordLike) {
  if (!record.data) return undefined;
  const bytes = new Uint8Array(record.data.buffer, record.data.byteOffset, record.data.byteLength);
  return new TextDecoder().decode(bytes);
}

export function webNfcSupport() {
  const available = typeof window !== "undefined" && "NDEFReader" in window;
  const secure = typeof window !== "undefined" && window.isSecureContext;
  return {
    available,
    secure,
    ready: available && secure,
    reason: !secure ? "Web NFC requires a secure HTTPS context." : !available ? "Web NFC is not available in this browser. Use Android Chrome or a reader bridge." : "Ready"
  };
}

export async function startWebNfcScan(onRead: (read: WebNfcRead) => void, onError: (error: Error) => void) {
  const support = webNfcSupport();
  if (!support.ready) throw new Error(support.reason);

  const Reader = (window as unknown as { NDEFReader: NdefReaderConstructor }).NDEFReader;
  const reader = new Reader();
  const controller = new AbortController();

  reader.addEventListener("readingerror", () => onError(new Error("NFC tag detected but NDEF data could not be read.")));
  reader.addEventListener("reading", ((event: NdefReadingEventLike) => {
    try {
      const records = event.message.records.map((record) => ({
        recordType: record.recordType,
        mediaType: record.mediaType,
        text: decodeRecord(record)
      }));
      const urlRecord = records.find((record) => record.recordType === "url" || record.recordType === "absolute-url");
      const serialNumber = (event.serialNumber ?? "").replace(/[:\s-]/g, "").toUpperCase();
      onRead({ serialNumber, url: urlRecord?.text, records });
    } catch (error) {
      onError(error instanceof Error ? error : new Error(String(error)));
    }
  }) as EventListener);

  await reader.scan({ signal: controller.signal });
  return () => controller.abort();
}
