// Shared type definitions for the Audio Script extension

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

// A completed question/answer pair in the lecture chat.
interface ChatExchange {
  question: string;
  answer: string;
}

// One answer option in a quiz question.
interface QuizOption {
  text: string;
  isCorrect: boolean;
  explanation: string;
}

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

interface RecordingResponse {
  ok: boolean;
  info?: string;
  error?: string;
  requiresSessionConfirmation?: boolean;
  active?: boolean;
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

// Response carrying the saved chat history back to the content script.
interface ChatHistoryResponse {
  ok: boolean;
  history?: ChatExchange[];
  error?: string;
}

// Quiz topics response.
interface QuizTopicsResponse {
  ok: boolean;
  enoughContent?: boolean;
  topics?: string[];
  error?: string;
}

// Quiz question response.
interface QuizQuestionResponse {
  ok: boolean;
  enoughContent?: boolean;
  question?: string;
  options?: QuizOption[];
  error?: string;
}

interface CaptureRecord {
  mode: CaptureMode;
  status: CaptureStatus;
  tabId: number;
  updatedAt: number;
}
