"use strict";
// Initialize the WebSocket variable
let socket = null;
// Track whether a connection attempt is in progress
let connecting = false;
// Store the active transcript in the background script
let transcriptChunks = [];
// Track which tab started the current recording session
let activeTabId = null;
// Track the currently active capture mode
let captureMode = null;
// Track whether the current tab capture is paused
let isCapturePaused = false;
// Storage keys
const TRANSCRIPT_STORAGE_KEY = "transcriptChunks";
const ACTIVE_TAB_STORAGE_KEY = "activeTranscriptTabId";
/**
 * Load the saved transcript state from local storage.
 */
async function loadTranscriptState() {
    try {
        const result = await chrome.storage.local.get([
            TRANSCRIPT_STORAGE_KEY,
            ACTIVE_TAB_STORAGE_KEY,
        ]);
        const storedChunks = result[TRANSCRIPT_STORAGE_KEY];
        const storedTabId = result[ACTIVE_TAB_STORAGE_KEY];
        if (Array.isArray(storedChunks)) {
            transcriptChunks = storedChunks.filter((item) => typeof item === "string");
        }
        else {
            transcriptChunks = [];
        }
        activeTabId = typeof storedTabId === "number" ? storedTabId : null;
    }
    catch (err) {
        console.error("Error loading transcript state:", err);
        transcriptChunks = [];
        activeTabId = null;
    }
}
/**
 * Save the current transcript state to local storage.
 */
async function saveTranscriptState() {
    try {
        await chrome.storage.local.set({
            [TRANSCRIPT_STORAGE_KEY]: transcriptChunks,
            [ACTIVE_TAB_STORAGE_KEY]: activeTabId,
        });
    }
    catch (err) {
        console.error("Error saving transcript state:", err);
    }
}
/**
 * Clear the current transcript from memory and local storage.
 */
async function clearTranscript() {
    transcriptChunks = [];
    await saveTranscriptState();
}
/**
 * Set the current active tab and persist it.
 */
async function setActiveTab(tabId) {
    activeTabId = tabId;
    await saveTranscriptState();
}
/**
 * Start a new transcript session for a specific tab.
 */
async function startNewTranscriptSession(tabId) {
    await setActiveTab(tabId);
    await clearTranscript();
}
/**
 * Add a new chunk of transcript to memory and persist it.
 */
async function appendTranscript(text) {
    const trimmedText = text.trim();
    if (!trimmedText) {
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
 * Start a PDF download from a regular HTTP URL.
 */
async function downloadPdfFromUrl(downloadUrl, filename) {
    return new Promise((resolve, reject) => {
        chrome.downloads.download({
            url: downloadUrl,
            filename,
            saveAs: true,
        }, (downloadId) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
            }
            if (downloadId === undefined) {
                reject(new Error("Failed to start PDF download"));
                return;
            }
            resolve();
        });
    });
}
async function ensureOffscreenDocument() {
    const contexts = await chrome.runtime.getContexts({});
    const hasOffscreenDocument = contexts.some((context) => context.contextType === "OFFSCREEN_DOCUMENT");
    if (hasOffscreenDocument) {
        return;
    }
    await chrome.offscreen.createDocument({
        url: "offscreen.html",
        reasons: ["USER_MEDIA"],
        justification: "Capture tab audio for lecture transcription",
    });
}
async function closeOffscreenDocumentIfOpen() {
    const contexts = await chrome.runtime.getContexts({});
    const hasOffscreenDocument = contexts.some((context) => context.contextType === "OFFSCREEN_DOCUMENT");
    if (!hasOffscreenDocument) {
        return;
    }
    await chrome.offscreen.closeDocument();
}
function sendRuntimeMessage(message) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(message, (response) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
            }
            resolve(response);
        });
    });
}
async function startTabCapturePath(tabId) {
    await ensureOffscreenDocument();
    const streamId = await chrome.tabCapture.getMediaStreamId({
        targetTabId: tabId,
    });
    const response = await sendRuntimeMessage({
        type: "START_TAB_CAPTURE_INTERNAL",
        target: "offscreen",
        streamId,
    });
    if (!response.ok) {
        throw new Error(response.error || "Failed to start offscreen tab capture");
    }
}
async function pauseTabCapturePath() {
    const response = await sendRuntimeMessage({
        type: "PAUSE_TAB_CAPTURE_INTERNAL",
        target: "offscreen",
    });
    if (!response.ok) {
        throw new Error(response.error || "Failed to pause offscreen tab capture");
    }
}
async function resumeTabCapturePath() {
    const response = await sendRuntimeMessage({
        type: "RESUME_TAB_CAPTURE_INTERNAL",
        target: "offscreen",
    });
    if (!response.ok) {
        throw new Error(response.error || "Failed to resume offscreen tab capture");
    }
}
async function stopTabCapturePath() {
    const response = await sendRuntimeMessage({
        type: "STOP_TAB_CAPTURE_INTERNAL",
        target: "offscreen",
    });
    if (!response.ok) {
        throw new Error(response.error || "Failed to stop offscreen tab capture");
    }
    await closeOffscreenDocumentIfOpen();
}
function connectWebSocket() {
    if (socket && socket.readyState === WebSocket.OPEN)
        return;
    if (connecting)
        return;
    connecting = true;
    try {
        socket = new WebSocket("ws://localhost:3001");
        socket.onopen = () => {
            console.log("WebSocket is connected");
            connecting = false;
        };
        socket.onmessage = async (message) => {
            const text = typeof message.data === "string"
                ? message.data
                : String(message.data);
            try {
                await appendTranscript(text);
            }
            catch (err) {
                console.error("Error appending transcript chunk:", err);
            }
        };
        socket.onclose = () => {
            connecting = false;
            socket = null;
        };
        socket.onerror = (_err) => {
            connecting = false;
            if (socket) {
                try {
                    socket.close();
                }
                catch { }
                socket = null;
            }
        };
    }
    catch {
        connecting = false;
        socket = null;
    }
}
async function beginRecordingForTab(tabId) {
    if (captureMode !== null) {
        if (activeTabId === tabId && captureMode === "tab") {
            return {
                ok: true,
                info: "Tab capture is already armed",
            };
        }
        return { ok: false, error: "Recording already active on another tab" };
    }
    const shouldStartNewTranscriptSession = activeTabId !== tabId;
    connectWebSocket();
    try {
        await startTabCapturePath(tabId);
        captureMode = "tab";
        isCapturePaused = true;
        if (shouldStartNewTranscriptSession) {
            await startNewTranscriptSession(tabId);
        }
        else {
            await setActiveTab(tabId);
        }
        console.log("Tab capture armed and waiting for video play");
        return {
            ok: true,
            info: "Tab capture armed. Recording will start when the video plays.",
        };
    }
    catch (error) {
        captureMode = null;
        isCapturePaused = false;
        const message = error instanceof Error ? error.message : "Failed to start tab capture";
        console.error("tabCapture path failed:", message);
        return {
            ok: false,
            error: `Tab capture failed: ${message}`,
        };
    }
}
async function resumeRecordingForTab(tabId) {
    if (activeTabId !== tabId || captureMode !== "tab") {
        return {
            ok: false,
            error: "Click the extension icon on this tab before playing the video",
        };
    }
    if (!isCapturePaused) {
        return { ok: true, info: "Tab capture already recording" };
    }
    try {
        connectWebSocket();
        await resumeTabCapturePath();
        isCapturePaused = false;
        return { ok: true, info: "Tab capture recording started" };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Failed to resume tab capture";
        return { ok: false, error: message };
    }
}
async function pauseRecording() {
    if (captureMode !== "tab") {
        return { ok: true, info: "No active recording to pause" };
    }
    if (isCapturePaused) {
        return { ok: true, info: "Tab capture already paused" };
    }
    try {
        await pauseTabCapturePath();
        isCapturePaused = true;
        return { ok: true, info: "Tab capture paused" };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Failed to pause tab capture";
        return { ok: false, error: message };
    }
}
async function endRecording() {
    if (captureMode === "tab") {
        try {
            await stopTabCapturePath();
            captureMode = null;
            isCapturePaused = false;
            return { ok: true, info: "Tab capture stopped" };
        }
        catch (error) {
            captureMode = null;
            isCapturePaused = false;
            const message = error instanceof Error ? error.message : "Failed to stop tab capture";
            return { ok: false, error: message };
        }
    }
    return { ok: true, info: "No active recording to stop" };
}
// Restore transcript state when the service worker starts
loadTranscriptState().catch((err) => {
    console.error("Failed to initialize transcript state:", err);
});
// Start/stop from the extension icon.
// The first click arms tabCapture but does not record yet.
// A second click stops tabCapture and closes the offscreen document.
chrome.action.onClicked.addListener(async (tab) => {
    const tabId = tab.id;
    if (tabId === undefined) {
        console.error("Could not identify the clicked tab");
        return;
    }
    if (captureMode !== null && activeTabId === tabId) {
        const stopResponse = await endRecording();
        if (!stopResponse.ok) {
            console.error("Error stopping recording from action click:", stopResponse.error);
        }
        return;
    }
    const startResponse = await beginRecordingForTab(tabId);
    if (!startResponse.ok) {
        console.error("Error arming tab capture from action click:", startResponse.error);
    }
});
// Central message router invoked by the content scripts injected into tabs.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.target === "offscreen") {
        return;
    }
    (async () => {
        if (msg && msg.type === "START_RECORDING") {
            const tabId = sender.tab?.id;
            if (tabId === undefined) {
                return { ok: false, error: "Could not identify the active tab" };
            }
            return await resumeRecordingForTab(tabId);
        }
        if (msg && msg.type === "STOP_RECORDING") {
            return await pauseRecording();
        }
        if (msg && msg.type === "ASK_LECTURE") {
            const requesterTabId = sender.tab?.id;
            const question = msg.question?.trim();
            if (!question) {
                return {
                    ok: false,
                    error: "לא התקבלה שאלה תקינה.",
                };
            }
            let fullTranscript = "";
            if (requesterTabId !== undefined && requesterTabId === activeTabId) {
                fullTranscript = await getFullTranscript();
            }
            else {
                console.warn("ASK_LECTURE was sent without an active transcript session for this tab.");
            }
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000);
            try {
                const response = await fetch("http://localhost:3000/ask", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        question,
                        transcript: fullTranscript,
                    }),
                    signal: controller.signal,
                });
                clearTimeout(timeoutId);
                if (!response.ok) {
                    throw new Error(`Server returned ${response.status}: ${response.statusText}`);
                }
                const data = await response.json();
                if (!data.success) {
                    return {
                        ok: false,
                        error: data.error || "שגיאה בקבלת תשובה מהשרת.",
                    };
                }
                return {
                    ok: true,
                    answer: data.answer || "לא התקבלה תשובה מהשרת.",
                };
            }
            catch (err) {
                clearTimeout(timeoutId);
                const error = err;
                console.error("Error asking lecture question:", error);
                if (error.name === "TypeError" && error.message.includes("fetch")) {
                    return {
                        ok: false,
                        error: "השרת לא פועל. אנא הפעל את השרת תחילה.",
                    };
                }
                if (error.name === "AbortError") {
                    return {
                        ok: false,
                        error: "הבקשה ארכה זמן רב מדי. נסה שוב.",
                    };
                }
                return {
                    ok: false,
                    error: error.message || "שגיאה בקבלת תשובה מהשרת.",
                };
            }
        }
        if (msg && msg.type === "GENERATE_SUMMARY") {
            const requesterTabId = sender.tab?.id;
            if (requesterTabId === undefined || requesterTabId !== activeTabId) {
                return {
                    ok: false,
                    error: "No active transcript session for this tab",
                };
            }
            const fullTranscript = await getFullTranscript();
            if (!fullTranscript) {
                return {
                    ok: false,
                    error: "אין תמלול זמין לסיכום, אנא הפעל הקלטה תחילה",
                };
            }
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000);
            try {
                const response = await fetch("http://localhost:3000/summarize", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ text: fullTranscript }),
                    signal: controller.signal,
                });
                clearTimeout(timeoutId);
                if (!response.ok) {
                    throw new Error(`Server returned ${response.status}: ${response.statusText}`);
                }
                const data = await response.json();
                if (data.success && data.downloadUrl) {
                    await downloadPdfFromUrl(data.downloadUrl, data.filename || "סיכום הרצאה.pdf");
                    return {
                        ok: true,
                        info: "PDF download started",
                    };
                }
                throw new Error(data.error || "Failed to generate summary");
            }
            catch (err) {
                clearTimeout(timeoutId);
                const error = err;
                console.error("Error generating summary:", error);
                if (error.name === "TypeError" && error.message.includes("fetch")) {
                    return {
                        ok: false,
                        error: "השרת לא פועל. אנא הפעל את השרת תחילה.",
                    };
                }
                else if (error.name === "AbortError") {
                    return {
                        ok: false,
                        error: "הבקשה ארכה זמן רב מדי. נסה שוב.",
                    };
                }
                else {
                    return {
                        ok: false,
                        error: error.message || "שגיאה ביצירת הסיכום",
                    };
                }
            }
        }
        return { ok: false, error: "Unknown message type" };
    })()
        .then(sendResponse)
        .catch((err) => {
        const errorMessage = err instanceof Error ? err.message : "Unexpected background error";
        sendResponse({ ok: false, error: errorMessage });
    });
    return true;
});
