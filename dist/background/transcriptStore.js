const TRANSCRIPT_STORAGE_KEY = "transcriptChunks";
const CURRENT_SESSION_STORAGE_KEY = "currentLectureSession";
// Used to migrate transcript data saved before session support was added.
const LEGACY_ACTIVE_TAB_STORAGE_KEY = "activeTranscriptTabId";
let transcriptChunks = [];
let currentSession = null;
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
 * Load the saved transcript state from local storage.
 */
async function loadTranscriptState() {
    try {
        const result = await chrome.storage.local.get([
            TRANSCRIPT_STORAGE_KEY,
            CURRENT_SESSION_STORAGE_KEY,
            LEGACY_ACTIVE_TAB_STORAGE_KEY,
        ]);
        const storedChunks = result[TRANSCRIPT_STORAGE_KEY];
        const storedSession = result[CURRENT_SESSION_STORAGE_KEY];
        const legacyActiveTabId = result[LEGACY_ACTIVE_TAB_STORAGE_KEY];
        transcriptChunks = Array.isArray(storedChunks)
            ? storedChunks.filter((item) => typeof item === "string")
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
 * Start a new lecture session and clear the previous transcript.
 */
async function startNewTranscriptSession(tabId, context) {
    currentSession = {
        id: crypto.randomUUID(),
        tabId,
        context,
        startedAt: Date.now(),
    };
    transcriptChunks = [];
    await saveTranscriptState();
}
/**
 * Add a transcript chunk to the active lecture session.
 */
async function appendTranscript(text) {
    const trimmedText = text.trim();
    if (!trimmedText) {
        return;
    }
    if (!currentSession) {
        console.warn("Ignoring transcript chunk because no lecture session is active.");
        return;
    }
    transcriptChunks.push(trimmedText);
    await saveTranscriptState();
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
    startNewTranscriptSession,
    appendTranscript,
    getFullTranscript,
    hasTranscript,
    getCurrentSession,
    getActiveTabId,
    isSameLectureContext,
};
