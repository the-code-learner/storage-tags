export type RfidSource =
  | "browser-hid"
  | "browser-webserial"
  | "browser-webusb"
  | "server-serial"
  | "server-hid"
  | "mock";

export type RfidReadEvent = {
  epc: string;
  tid?: string;
  rssi?: number;
  antenna?: number;
  source: RfidSource;
  stationId?: string;
  sessionId?: string;
  deviceLabel?: string;
  raw?: string;
  seenAt: string;
};
