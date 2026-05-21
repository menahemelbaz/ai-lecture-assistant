// Shared type definitions for the Audio Script extension

interface RecordingResponse {
  ok: boolean;
  info?: string;
  error?: string;
}

interface SummaryResponse {
  ok: boolean;
  info?: string;
  error?: string;
}

interface InternalCaptureResponse {
  ok: boolean;
  error?: string;
}

interface AskLectureResponse {
  ok: boolean;
  answer?: string;
  error?: string;
}

type ExtensionMessageType =
  | "START_RECORDING"
  | "STOP_RECORDING"
  | "ASK_LECTURE"
  | "GENERATE_SUMMARY"
  | "START_TAB_CAPTURE_INTERNAL"
  | "PAUSE_TAB_CAPTURE_INTERNAL"
  | "RESUME_TAB_CAPTURE_INTERNAL"
  | "STOP_TAB_CAPTURE_INTERNAL";

interface ExtensionMessage {
  type: ExtensionMessageType;
  target?: "offscreen";
  streamId?: string;
  question?: string;
}
