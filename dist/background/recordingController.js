import { TranscriptStore } from "./transcriptStore.js";
import { connectWebSocket } from "./websocketClient.js";
import { TabCaptureController } from "./tabCaptureController.js";
// Track the currently active capture mode
let captureMode = null;
// Track whether the current tab capture is paused
let isCapturePaused = false;
/**
 * Connect to the transcription WebSocket and store incoming transcript chunks.
 */
function connectTranscriptWebSocket() {
    connectWebSocket(async (text) => {
        await TranscriptStore.appendTranscript(text);
    });
}
/**
 * Return whether the current recording session belongs to the given tab.
 */
function isActiveRecordingTab(tabId) {
    const activeTabId = TranscriptStore.getActiveTabId();
    return captureMode !== null && activeTabId === tabId;
}
/**
 * Arm tab capture for a specific tab.
 * Recording will start only when the video starts playing.
 */
async function beginRecordingForTab(tabId) {
    const activeTabId = TranscriptStore.getActiveTabId();
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
    connectTranscriptWebSocket();
    try {
        await TabCaptureController.startTabCapturePath(tabId);
        captureMode = "tab";
        isCapturePaused = true;
        if (shouldStartNewTranscriptSession) {
            await TranscriptStore.startNewTranscriptSession(tabId);
        }
        else {
            await TranscriptStore.setActiveTab(tabId);
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
/**
 * Resume audio recording for the active tab.
 */
async function resumeRecordingForTab(tabId) {
    const activeTabId = TranscriptStore.getActiveTabId();
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
        connectTranscriptWebSocket();
        await TabCaptureController.resumeTabCapturePath();
        isCapturePaused = false;
        return { ok: true, info: "Tab capture recording started" };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Failed to resume tab capture";
        return { ok: false, error: message };
    }
}
/**
 * Pause the active tab capture session.
 */
async function pauseRecording() {
    if (captureMode !== "tab") {
        return { ok: true, info: "No active recording to pause" };
    }
    if (isCapturePaused) {
        return { ok: true, info: "Tab capture already paused" };
    }
    try {
        await TabCaptureController.pauseTabCapturePath();
        isCapturePaused = true;
        return { ok: true, info: "Tab capture paused" };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Failed to pause tab capture";
        return { ok: false, error: message };
    }
}
/**
 * Stop the active tab capture session.
 */
async function endRecording() {
    if (captureMode === "tab") {
        try {
            await TabCaptureController.stopTabCapturePath();
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
export const RecordingController = {
    isActiveRecordingTab,
    beginRecordingForTab,
    resumeRecordingForTab,
    pauseRecording,
    endRecording,
};
