const TRANSCRIPT_STORAGE_KEY = "transcriptChunks";
const CURRENT_SESSION_STORAGE_KEY = "currentLectureSession";
const CHAT_HISTORY_STORAGE_KEY = "lectureChatHistory";
// Used to migrate transcript data saved before session support was added.
const LEGACY_ACTIVE_TAB_STORAGE_KEY = "activeTranscriptTabId";
let transcriptChunks = [];
let currentSession = null;
let chatHistory = [];
/**
 * Check whether a stored value is a valid lecture context.
 */
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
/**
 * Check whether a stored value is a valid lecture session.
 */
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
/**
 * Check whether a stored value is a valid chat exchange.
 */
function isChatExchange(value) {
    if (!value || typeof value !== "object") {
        return false;
    }
    const exchange = value;
    return (typeof exchange.question === "string" &&
        typeof exchange.answer === "string");
}
/**
 * Load the saved transcript state from local storage.
 */
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
        // Preserve transcripts created before lecture sessions were introduced.
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
/**
 * Save the current transcript state to local storage.
 */
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
/**
 * Clear the current transcript without removing the active session.
 */
async function clearTranscript() {
    transcriptChunks = [];
    await saveTranscriptState();
}
/**
 * Clear the transcript, the active session, AND the chat history entirely.
 * Used when the extension is turned off, returning to a clean state so a later
 * activation does not see a stale session or old chat from a previous lecture.
 */
async function clearSession() {
    transcriptChunks = [];
    currentSession = null;
    chatHistory = [];
    await saveTranscriptState();
}
/**
 * Start a new lecture session and clear the previous transcript and chat.
 */
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
/**
 * Add a transcript chunk to the active lecture session.
 *
 * The expectedSessionId guards against a race during lecture switches: a chunk
 * from the previous lecture can arrive (or finish awaiting) after a new session
 * has already replaced the current one. We re-check the session id after the
 * async write and drop the chunk if it no longer belongs to the active session.
 */
async function appendTranscript(text, expectedSessionId) {
    const trimmedText = text.trim();
    if (!trimmedText) {
        return;
    }
    if (!currentSession) {
        console.warn("Ignoring transcript chunk because no lecture session is active.");
        return;
    }
    if (expectedSessionId !== undefined &&
        expectedSessionId !== currentSession.id) {
        console.warn("Dropping transcript chunk from a session that is no longer active.");
        return;
    }
    transcriptChunks.push(trimmedText);
    await saveTranscriptState();
}
/**
 * Save a completed question/answer exchange to the chat history.
 * Only stored when there is an active session, so chat is tied to a lecture and
 * is cleared together with it.
 */
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
/**
 * Return the saved chat history for the current session.
 */
function getChatHistory() {
    return chatHistory;
}
/**
 * Return the full transcript as a single string.
 */
async function getFullTranscript() {
    if (transcriptChunks.length === 0) {
        await loadTranscriptState();
    }
    return transcriptChunks.join(" ").trim();
}
/**
 * Return whether the current session contains transcript text.
 */
function hasTranscript() {
    return transcriptChunks.length > 0;
}
/**
 * Return the current lecture session.
 */
function getCurrentSession() {
    return currentSession;
}
/**
 * Return the id of the current lecture session, if any.
 */
function getCurrentSessionId() {
    return currentSession?.id ?? null;
}
/**
 * Return the tab associated with the current lecture session.
 */
function getActiveTabId() {
    return currentSession?.tabId ?? null;
}
/**
 * Check whether two contexts appear to represent the same lecture.
 */
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
