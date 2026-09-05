const TRANSCRIPT_STORAGE_KEY = "transcriptChunks";
const CURRENT_SESSION_STORAGE_KEY = "currentLectureSession";
const CHAT_HISTORY_STORAGE_KEY = "lectureChatHistory";

// Supports transcript data stored before lecture sessions were introduced.
const LEGACY_ACTIVE_TAB_STORAGE_KEY = "activeTranscriptTabId";

let transcriptChunks: string[] = [];
let currentSession: LectureSession | null = null;
let chatHistory: ChatExchange[] = [];

// Verifies that a value loaded from storage is a valid lecture context.
function isLectureContext(value: unknown): value is LectureContext {
  if (!value || typeof value !== "object") {
    return false;
  }

  const context = value as Partial<LectureContext>;

  return (
    typeof context.pageUrl === "string" &&
    typeof context.pageTitle === "string" &&
    (typeof context.videoSrc === "string" || context.videoSrc === null) &&
    (typeof context.videoDuration === "number" ||
      context.videoDuration === null)
  );
}

// Verifies that a value loaded from storage is a valid lecture session.
function isLectureSession(value: unknown): value is LectureSession {
  if (!value || typeof value !== "object") {
    return false;
  }

  const session = value as Partial<LectureSession>;

  return (
    typeof session.id === "string" &&
    typeof session.tabId === "number" &&
    typeof session.startedAt === "number" &&
    isLectureContext(session.context)
  );
}

// Verifies that a value loaded from storage is a valid chat exchange.
function isChatExchange(value: unknown): value is ChatExchange {
  if (!value || typeof value !== "object") {
    return false;
  }

  const exchange = value as Partial<ChatExchange>;

  return (
    typeof exchange.question === "string" &&
    typeof exchange.answer === "string"
  );
}

// Restores the transcript, lecture session, and chat history from local storage.
async function loadTranscriptState(): Promise<void> {
  try {
    const result = await chrome.storage.local.get([
      TRANSCRIPT_STORAGE_KEY,
      CURRENT_SESSION_STORAGE_KEY,
      CHAT_HISTORY_STORAGE_KEY,
      LEGACY_ACTIVE_TAB_STORAGE_KEY,
    ]);

    const storedChunks = result[TRANSCRIPT_STORAGE_KEY];
    const storedSession = result[CURRENT_SESSION_STORAGE_KEY];
    const storedChat = result[CHAT_HISTORY_STORAGE_KEY];
    const legacyActiveTabId = result[LEGACY_ACTIVE_TAB_STORAGE_KEY];

    transcriptChunks = Array.isArray(storedChunks)
      ? storedChunks.filter(
        (item: unknown): item is string => typeof item === "string"
      )
      : [];

    chatHistory = Array.isArray(storedChat)
      ? storedChat.filter(isChatExchange)
      : [];

    if (isLectureSession(storedSession)) {
      currentSession = storedSession;
      return;
    }

    // Migrate legacy transcript data into the current session structure.
    if (
      transcriptChunks.length > 0 &&
      typeof legacyActiveTabId === "number"
    ) {
      currentSession = {
        id: crypto.randomUUID(),
        tabId: legacyActiveTabId,
        context: {
          pageUrl: "",
          pageTitle: "",
          videoSrc: null,
          videoDuration: null,
        },
        startedAt: Date.now(),
      };

      await saveTranscriptState();
      return;
    }

    currentSession = null;
  } catch (err) {
    console.error("Error loading transcript state:", err);
    transcriptChunks = [];
    currentSession = null;
    chatHistory = [];
  }
}

// Persists the current transcript, lecture session, and chat history.
async function saveTranscriptState(): Promise<void> {
  try {
    await chrome.storage.local.set({
      [TRANSCRIPT_STORAGE_KEY]: transcriptChunks,
      [CURRENT_SESSION_STORAGE_KEY]: currentSession,
      [CHAT_HISTORY_STORAGE_KEY]: chatHistory,
    });

    await chrome.storage.local.remove(LEGACY_ACTIVE_TAB_STORAGE_KEY);
  } catch (err) {
    console.error("Error saving transcript state:", err);
  }
}

// Clears the transcript while preserving the current lecture session.
async function clearTranscript(): Promise<void> {
  transcriptChunks = [];
  await saveTranscriptState();
}

// Clears all lecture data so the next activation starts with a clean session.
async function clearSession(): Promise<void> {
  transcriptChunks = [];
  currentSession = null;
  chatHistory = [];

  await saveTranscriptState();
}

// Creates a new lecture session and resets its transcript and chat history.
async function startNewTranscriptSession(
  tabId: number,
  context: LectureContext
): Promise<void> {
  currentSession = {
    id: crypto.randomUUID(),
    tabId,
    context,
    startedAt: Date.now(),
  };

  transcriptChunks = [];
  chatHistory = [];

  await saveTranscriptState();
}

// Appends transcript text only when it belongs to the active lecture session.
async function appendTranscript(
  text: string,
  expectedSessionId?: string
): Promise<void> {
  const trimmedText = text.trim();

  if (!trimmedText) {
    return;
  }

  if (!currentSession) {
    console.warn(
      "Ignoring transcript chunk because no lecture session is active."
    );
    return;
  }

  // Reject chunks created for a lecture session that is no longer active.
  if (
    expectedSessionId !== undefined &&
    expectedSessionId !== currentSession.id
  ) {
    console.warn(
      "Dropping transcript chunk from a session that is no longer active."
    );
    return;
  }

  transcriptChunks.push(trimmedText);
  await saveTranscriptState();
}

// Stores a completed chat exchange only when a lecture session is active.
async function appendChatExchange(
  question: string,
  answer: string
): Promise<void> {
  const trimmedQuestion = question.trim();
  const trimmedAnswer = answer.trim();

  if (!trimmedQuestion || !trimmedAnswer) {
    return;
  }

  if (!currentSession) {
    return;
  }

  chatHistory.push({
    question: trimmedQuestion,
    answer: trimmedAnswer,
  });

  await saveTranscriptState();
}

function getChatHistory(): ChatExchange[] {
  return chatHistory;
}

// Loads persisted chunks when necessary and combines them into one transcript.
async function getFullTranscript(): Promise<string> {
  if (transcriptChunks.length === 0) {
    await loadTranscriptState();
  }

  return transcriptChunks.join(" ").trim();
}

function hasTranscript(): boolean {
  return transcriptChunks.length > 0;
}

function getCurrentSession(): LectureSession | null {
  return currentSession;
}

function getCurrentSessionId(): string | null {
  return currentSession?.id ?? null;
}

function getActiveTabId(): number | null {
  return currentSession?.tabId ?? null;
}

// Extracts the stable video id from a standard YouTube watch URL.
function getYouTubeVideoId(pageUrl: string): string | null {
  try {
    const url = new URL(pageUrl);
    const isYouTubeHost =
      url.hostname === "youtube.com" ||
      url.hostname.endsWith(".youtube.com");

    if (!isYouTubeHost) {
      return null;
    }

    const videoId = url.searchParams.get("v");

    return videoId && videoId.length > 0 ? videoId : null;
  } catch {
    return null;
  }
}

// Compares available lecture metadata while tolerating a small duration difference.
function isSameLectureContext(
  current: LectureContext,
  next: LectureContext
): boolean {
  const currentYouTubeVideoId = getYouTubeVideoId(current.pageUrl);
  const nextYouTubeVideoId = getYouTubeVideoId(next.pageUrl);

  // On YouTube, ads may replace the media source and duration without changing
  // the lecture. The URL's v parameter changes only when the actual video changes.
  if (currentYouTubeVideoId !== null && nextYouTubeVideoId !== null) {
    return currentYouTubeVideoId === nextYouTubeVideoId;
  }

  const bothPageUrlsAvailable =
    current.pageUrl.length > 0 && next.pageUrl.length > 0;

  if (bothPageUrlsAvailable && current.pageUrl !== next.pageUrl) {
    return false;
  }

  const bothVideoSourcesAvailable =
    current.videoSrc !== null && next.videoSrc !== null;

  if (
    bothVideoSourcesAvailable &&
    current.videoSrc !== next.videoSrc
  ) {
    return false;
  }

  const durationDifference =
    current.videoDuration !== null &&
      next.videoDuration !== null
      ? Math.abs(current.videoDuration - next.videoDuration)
      : null;

  if (durationDifference !== null && durationDifference > 2) {
    return false;
  }

  const bothPageTitlesAvailable =
    current.pageTitle.length > 0 && next.pageTitle.length > 0;

  if (
    bothPageTitlesAvailable &&
    current.pageTitle !== next.pageTitle
  ) {
    return false;
  }

  const hasMatchingPageUrl =
    bothPageUrlsAvailable && current.pageUrl === next.pageUrl;

  const hasMatchingVideoSource =
    bothVideoSourcesAvailable &&
    current.videoSrc === next.videoSrc;

  const hasSimilarDuration =
    durationDifference !== null && durationDifference <= 2;

  const hasMatchingPageTitle =
    bothPageTitlesAvailable &&
    current.pageTitle === next.pageTitle;

  return (
    hasMatchingPageUrl ||
    hasMatchingVideoSource ||
    hasSimilarDuration ||
    hasMatchingPageTitle
  );
}

export const TranscriptStore = {
  loadTranscriptState,
  saveTranscriptState,
  clearTranscript,
  clearSession,
  startNewTranscriptSession,
  appendTranscript,
  appendChatExchange,
  getChatHistory,
  getFullTranscript,
  hasTranscript,
  getCurrentSession,
  getCurrentSessionId,
  getActiveTabId,
  isSameLectureContext,
};
