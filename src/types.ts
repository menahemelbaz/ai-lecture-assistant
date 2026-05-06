// Shared type definitions for the Audio Script extension

interface RecordingResponse {
  ok: boolean;
  info?: string;
  pid?: number;
  error?: string;
}

interface SummaryResponse {
  ok: boolean;
  summary?: string;
  pdfBase64?: string;
  filename?: string;
  error?: string;
}

type ExtensionMessageType =
  | "START_RECORDING"
  | "STOP_RECORDING"
  | "GENERATE_SUMMARY";

interface ExtensionMessage {
  type: ExtensionMessageType;
}