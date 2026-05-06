"use strict";
// Initialize the WebSocket variable
let socket = null;
// Initialize the Python process
let pythonProcess = null;
// Track whether a connection attempt is in progress
let connecting = false;
// Store the active transcript in the background script
let transcriptChunks = [];
// Track which tab started the current recording session
let activeTabId = null;
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
        activeTabId =
            typeof storedTabId === "number" ? storedTabId : null;
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
function connectWebSocket() {
    // Exit if the WebSocket connection is already open
    if (socket && socket.readyState === WebSocket.OPEN)
        return;
    // Exit if a connection attempt is already in progress
    if (connecting)
        return;
    // Indicate that a connection attempt is in progress
    connecting = true;
    try {
        // Create a new WebSocket connection
        socket = new WebSocket("ws://localhost:3001");
        // Log a message once the WebSocket handshake completes
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
                catch {
                    // Ignore errors when closing.
                }
                socket = null;
            }
        };
    }
    catch {
        connecting = false;
        socket = null;
    }
}
// Restore transcript state when the service worker starts
loadTranscriptState().catch((err) => {
    console.error("Failed to initialize transcript state:", err);
});
// Central message router invoked by the content scripts injected into tabs.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    (async () => {
        if (msg && msg.type === "START_RECORDING") {
            // Ignore duplicate start requests while the recorder is already running.
            if (pythonProcess) {
                return { ok: false, error: "Recording already active" };
            }
            const tabId = sender.tab?.id;
            if (tabId === undefined) {
                return { ok: false, error: "Could not identify the active tab" };
            }
            await setActiveTab(tabId);
            await clearTranscript();
            // Ensure we have an active WebSocket subscription before capturing audio.
            connectWebSocket();
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);
            try {
                const response = await fetch("http://localhost:3000/start-recording", {
                    method: "POST",
                    signal: controller.signal,
                });
                clearTimeout(timeoutId);
                if (!response.ok) {
                    throw new Error(`Server returned ${response.status}: ${response.statusText}`);
                }
                const data = await response.json();
                pythonProcess = data.pid;
                console.log(`Recording started with PID: ${pythonProcess}`);
                return { ok: true, info: data.message, pid: pythonProcess };
            }
            catch (err) {
                clearTimeout(timeoutId);
                const error = err;
                if (error.name === "TypeError" &&
                    error.message.includes("fetch")) {
                    return {
                        ok: false,
                        error: "Server is not running. Please start the server first.",
                    };
                }
                else if (error.name === "AbortError") {
                    return {
                        ok: false,
                        error: "Request timed out. Server may not be responding.",
                    };
                }
                else {
                    return {
                        ok: false,
                        error: error.message || "Failed to start recording",
                    };
                }
            }
        }
        if (msg && msg.type === "STOP_RECORDING") {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);
            try {
                const response = await fetch("http://localhost:3000/stop-recording", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ pid: pythonProcess }),
                    signal: controller.signal,
                });
                clearTimeout(timeoutId);
                pythonProcess = null;
                if (!response.ok) {
                    throw new Error(`Server returned ${response.status}: ${response.statusText}`);
                }
                const data = await response.json();
                console.log("Recording stopped");
                return { ok: true, info: data.message };
            }
            catch (err) {
                clearTimeout(timeoutId);
                pythonProcess = null;
                const error = err;
                if (error.name === "TypeError" &&
                    error.message.includes("fetch")) {
                    return {
                        ok: true,
                        info: "Recording process cleared (server may not be running)",
                    };
                }
                else if (error.name === "AbortError") {
                    return {
                        ok: true,
                        info: "Recording process cleared (request timed out)",
                    };
                }
                else {
                    return {
                        ok: true,
                        info: "Recording process cleared (server may have stopped it)",
                    };
                }
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
                if (data.success && data.summary && data.pdfBase64) {
                    console.log("Summary generated successfully");
                    return {
                        ok: true,
                        summary: data.summary,
                        pdfBase64: data.pdfBase64,
                        filename: data.filename || "סיכום הרצאה.pdf",
                    };
                }
                throw new Error(data.error || "Failed to generate summary");
            }
            catch (err) {
                clearTimeout(timeoutId);
                const error = err;
                console.error("Error generating summary:", error);
                if (error.name === "TypeError" &&
                    error.message.includes("fetch")) {
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
