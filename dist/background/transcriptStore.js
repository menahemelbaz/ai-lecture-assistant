const TRANSCRIPT_STORAGE_KEY = "transcriptChunks";
const CURRENT_SESSION_STORAGE_KEY = "currentLectureSession";
const CHAT_HISTORY_STORAGE_KEY = "lectureChatHistory";
// Supports transcript data stored before lecture sessions were introduced.
const LEGACY_ACTIVE_TAB_STORAGE_KEY = "activeTranscriptTabId";
let transcriptChunks = [];
let currentSession = null;
let chatHistory = [];
// Verifies that a value loaded from storage is a valid lecture context.
function isLectureContext(value) {
    if (!value || typeof value !== "object") {
        return false;
    }
    const context = value;
    return (typeof context.pageUrl === "string" &&
        typeof context.pageTitle === "string" &&
        (typeof context.videoSrc === "string" || context.videoSrc === null) &&
        (typeof context.videoDuration === "number" ||
            context.videoDuration === null));
}
// Verifies that a value loaded from storage is a valid lecture session.
function isLectureSession(value) {
    if (!value || typeof value !== "object") {
        return false;
    }
    const session = value;
    return (typeof session.id === "string" &&
        typeof session.tabId === "number" &&
        typeof session.startedAt === "number" &&
        isLectureContext(session.context));
}
// Verifies that a value loaded from storage is a valid chat exchange.
function isChatExchange(value) {
    if (!value || typeof value !== "object") {
        return false;
    }
    const exchange = value;
    return (typeof exchange.question === "string" &&
        typeof exchange.answer === "string");
}
// Restores the transcript, lecture session, and chat history from local storage.
async function loadTranscriptState() {
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
            ? storedChunks.filter((item) => typeof item === "string")
            : [];
        chatHistory = Array.isArray(storedChat)
            ? storedChat.filter(isChatExchange)
            : [];
        if (isLectureSession(storedSession)) {
            currentSession = storedSession;
            return;
        }
        // Migrate legacy transcript data into the current session structure.
        if (transcriptChunks.length > 0 &&
            typeof legacyActiveTabId === "number") {
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
    }
    catch (err) {
        console.error("Error loading transcript state:", err);
        transcriptChunks = [];
        currentSession = null;
        chatHistory = [];
    }
}
// Persists the current transcript, lecture session, and chat history.
async function saveTranscriptState() {
    try {
        await chrome.storage.local.set({
            [TRANSCRIPT_STORAGE_KEY]: transcriptChunks,
            [CURRENT_SESSION_STORAGE_KEY]: currentSession,
            [CHAT_HISTORY_STORAGE_KEY]: chatHistory,
        });
        await chrome.storage.local.remove(LEGACY_ACTIVE_TAB_STORAGE_KEY);
    }
    catch (err) {
        console.error("Error saving transcript state:", err);
    }
}
// Clears the transcript while preserving the current lecture session.
async function clearTranscript() {
    transcriptChunks = [];
    await saveTranscriptState();
}
// Clears all lecture data so the next activation starts with a clean session.
async function clearSession() {
    transcriptChunks = [];
    currentSession = null;
    chatHistory = [];
    await saveTranscriptState();
}
// Creates a new lecture session and resets its transcript and chat history.
async function startNewTranscriptSession(tabId, context) {
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
async function appendTranscript(text, expectedSessionId) {
    const trimmedText = text.trim();
    if (!trimmedText) {
        return;
    }
    if (!currentSession) {
        console.warn("Ignoring transcript chunk because no lecture session is active.");
        return;
    }
    // Reject chunks created for a lecture session that is no longer active.
    if (expectedSessionId !== undefined &&
        expectedSessionId !== currentSession.id) {
        console.warn("Dropping transcript chunk from a session that is no longer active.");
        return;
    }
    transcriptChunks.push(trimmedText);
    await saveTranscriptState();
}
// Stores a completed chat exchange only when a lecture session is active.
async function appendChatExchange(question, answer) {
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
function getChatHistory() {
    return chatHistory;
}
// Loads persisted chunks when necessary and combines them into one transcript.
async function getFullTranscript() {
    if (transcriptChunks.length === 0) {
        await loadTranscriptState();
    }
    return transcriptChunks.join(" ").trim();
}
function hasTranscript() {
    return transcriptChunks.length > 0;
}
function getCurrentSession() {
    return currentSession;
}
function getCurrentSessionId() {
    return currentSession?.id ?? null;
}
function getActiveTabId() {
    return currentSession?.tabId ?? null;
}
// Compares available lecture metadata while tolerating a small duration difference.
function isSameLectureContext(current, next) {
    const bothPageUrlsAvailable = current.pageUrl.length > 0 && next.pageUrl.length > 0;
    if (bothPageUrlsAvailable && current.pageUrl !== next.pageUrl) {
        return false;
    }
    const bothVideoSourcesAvailable = current.videoSrc !== null && next.videoSrc !== null;
    if (bothVideoSourcesAvailable &&
        current.videoSrc !== next.videoSrc) {
        return false;
    }
    const durationDifference = current.videoDuration !== null &&
        next.videoDuration !== null
        ? Math.abs(current.videoDuration - next.videoDuration)
        : null;
    if (durationDifference !== null && durationDifference > 2) {
        return false;
    }
    const bothPageTitlesAvailable = current.pageTitle.length > 0 && next.pageTitle.length > 0;
    if (bothPageTitlesAvailable &&
        current.pageTitle !== next.pageTitle) {
        return false;
    }
    const hasMatchingPageUrl = bothPageUrlsAvailable && current.pageUrl === next.pageUrl;
    const hasMatchingVideoSource = bothVideoSourcesAvailable &&
        current.videoSrc === next.videoSrc;
    const hasSimilarDuration = durationDifference !== null && durationDifference <= 2;
    const hasMatchingPageTitle = bothPageTitlesAvailable &&
        current.pageTitle === next.pageTitle;
    return (hasMatchingPageUrl ||
        hasMatchingVideoSource ||
        hasSimilarDuration ||
        hasMatchingPageTitle);
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
