// Shared type definitions used throughout the Audio Script extension.

type ExtensionMessageType =
  | "CAPTURE_ARMED"
  | "CAPTURE_DISARMED"
  | "IS_TAB_ACTIVE"
  | "START_RECORDING"
  | "STOP_RECORDING"
  | "ASK_LECTURE"
  | "SAVE_CHAT_MESSAGE"
  | "GET_CHAT_HISTORY"
  | "GENERATE_SUMMARY"
  | "QUIZ_TOPICS"
  | "QUIZ_QUESTION"
  | "START_TAB_CAPTURE_INTERNAL"
  | "PAUSE_TAB_CAPTURE_INTERNAL"
  | "RESUME_TAB_CAPTURE_INTERNAL"
  | "STOP_TAB_CAPTURE_INTERNAL";

// Capture state is persisted to survive service worker restarts.
type CaptureMode = "tab";
type CaptureStatus = "armed" | "recording" | "paused";

// Metadata identifying the lecture and its video source.
interface LectureContext {
  pageUrl: string;
  pageTitle: string;
  videoSrc: string | null;
  videoDuration: number | null;
}

// Represents an active lecture recording session.
interface LectureSession {
  id: string;
  tabId: number;
  context: LectureContext;
  startedAt: number;
}

// Represents a completed question-and-answer exchange in the lecture chat.
interface ChatExchange {
  question: string;
  answer: string;
}

// Represents one possible answer in a quiz question.
interface QuizOption {
  text: string;
  isCorrect: boolean;
  explanation: string;
}

// Message payload shared between extension contexts.
interface ExtensionMessage {
  type: ExtensionMessageType;
  target?: "offscreen";
  streamId?: string;
  question?: string;
  answer?: string;
  topic?: string;
  lectureContext?: LectureContext;
  confirmNewSession?: boolean;
}

// Response returned by recording lifecycle operations.
interface RecordingResponse {
  ok: boolean;
  info?: string;
  error?: string;
  requiresSessionConfirmation?: boolean;
  active?: boolean;
}

// Response returned after requesting a lecture summary.
interface SummaryResponse {
  ok: boolean;
  info?: string;
  error?: string;
}

// Response returned by internal offscreen capture operations.
interface InternalCaptureResponse {
  ok: boolean;
  error?: string;
}

// Response returned after asking a question about the lecture.
interface AskLectureResponse {
  ok: boolean;
  answer?: string;
  error?: string;
}

// Response containing the saved chat history for the active session.
interface ChatHistoryResponse {
  ok: boolean;
  history?: ChatExchange[];
  error?: string;
}

// Response containing practice topics derived from the lecture.
interface QuizTopicsResponse {
  ok: boolean;
  enoughContent?: boolean;
  topics?: string[];
  error?: string;
}

// Response containing a generated quiz question and its answer options.
interface QuizQuestionResponse {
  ok: boolean;
  enoughContent?: boolean;
  question?: string;
  options?: QuizOption[];
  error?: string;
}

// Persisted snapshot of the current tab-capture state.
interface CaptureRecord {
  mode: CaptureMode;
  status: CaptureStatus;
  tabId: number;
  updatedAt: number;
}