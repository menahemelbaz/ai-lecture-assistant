// Shared type definitions for the Audio Script extension

type ExtensionMessageType =
  | "CAPTURE_ARMED"
  | "START_RECORDING"
  | "STOP_RECORDING"
  | "ASK_LECTURE"
  | "GENERATE_SUMMARY"
  | "START_TAB_CAPTURE_INTERNAL"
  | "PAUSE_TAB_CAPTURE_INTERNAL"
  | "RESUME_TAB_CAPTURE_INTERNAL"
  | "STOP_TAB_CAPTURE_INTERNAL";

// Recording lifecycle state, persisted so it survives service worker restarts.
type CaptureMode = "tab";
type CaptureStatus = "armed" | "recording" | "paused";

interface LectureContext {
  pageUrl: string;
  pageTitle: string;
  videoSrc: string | null;
  videoDuration: number | null;
}

interface LectureSession {
  id: string;
  tabId: number;
  context: LectureContext;
  startedAt: number;
}

interface ExtensionMessage {
  type: ExtensionMessageType;
  target?: "offscreen";
  streamId?: string;
  question?: string;
  lectureContext?: LectureContext;
  confirmNewSession?: boolean;
}

interface RecordingResponse {
  ok: boolean;
  info?: string;
  error?: string;
  requiresSessionConfirmation?: boolean;
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

interface CaptureRecord {
  mode: CaptureMode;
  status: CaptureStatus;
  tabId: number;
  updatedAt: number;
}
