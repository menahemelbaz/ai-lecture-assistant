import { TranscriptStore } from "./transcriptStore.js";
import { CaptureStore } from "./captureStore.js";
import { connectWebSocket } from "./websocketClient.js";
import { TabCaptureController } from "./tabCaptureController.js";
// Serialize recording state changes so pause, resume, and stop operations
// cannot run at the same time.
let recordingOperationQueue = Promise.resolve();
function runRecordingOperation(operation) {
    const result = recordingOperationQueue.then(operation, operation);
    recordingOperationQueue = result.then(() => undefined, () => undefined);
    return result;
}
/**
 * Connect to the transcription WebSocket and store incoming transcript chunks.
 */
function connectTranscriptWebSocket() {
    connectWebSocket(async (text) => {
        await TranscriptStore.appendTranscript(text);
    });
}
/**
 * Return whether an active capture belongs to the given tab.
 * Reads the persisted capture record, so it stays correct even after the
 * service worker has been restarted.
 */
async function isActiveRecordingTab(tabId) {
    const capture = await CaptureStore.getCaptureState();
    return capture !== null && capture.tabId === tabId;
}
/**
 * Reconcile the persisted capture record with reality on worker startup.
 *
 * In Manifest V3 the service worker can be terminated at any time. When it
 * wakes, the persisted record is the source of truth - but the offscreen
 * document that performs the actual capture may or may not still be alive.
 * This aligns the two and re-opens the transcript socket when a recording is
 * genuinely still in progress.
 */
async function restoreCaptureState() {
    const capture = await CaptureStore.getCaptureState();
    if (!capture) {
        return;
    }
    const offscreenAlive = await TabCaptureController.hasOffscreenDocument();
    // The offscreen document is gone, so no capture can be running.
    // Clear the stale record so the UI and controller agree again.
    if (!offscreenAlive) {
        await CaptureStore.clearCaptureState();
        return;
    }
    // A recording was in progress when the worker slept. Re-open the socket so
    // incoming transcript chunks are stored again.
    if (capture.status === "recording") {
        connectTranscriptWebSocket();
    }
}
/**
 * Arm tab capture for a specific tab.
 * Recording will start only when the video starts playing.
 */
async function beginRecordingForTab(tabId) {
    const existingCapture = await CaptureStore.getCaptureState();
    if (existingCapture !== null) {
        if (existingCapture.tabId === tabId) {
            return {
                ok: true,
                info: "Tab capture is already armed",
            };
        }
        return {
            ok: false,
            error: "Recording already active on another tab",
        };
    }
    connectTranscriptWebSocket();
    try {
        await TabCaptureController.startTabCapturePath(tabId);
        await CaptureStore.setCaptureState({
            mode: "tab",
            status: "armed",
            tabId,
            updatedAt: Date.now(),
        });
        console.log("Tab capture armed and waiting for video play");
        return {
            ok: true,
            info: "Tab capture armed. Recording will start when the video plays.",
        };
    }
    catch (error) {
        await CaptureStore.clearCaptureState();
        const message = error instanceof Error
            ? error.message
            : "Failed to start tab capture";
        console.error("tabCapture path failed:", message);
        return {
            ok: false,
            error: `Tab capture failed: ${message}`,
        };
    }
}
/**
 * Resume audio recording for the armed tab.
 */
function resumeRecordingForTab(tabId, lectureContext, confirmNewSession = false) {
    return runRecordingOperation(async () => {
        const capture = await CaptureStore.getCaptureState();
        if (capture === null || capture.tabId !== tabId) {
            return {
                ok: false,
                error: "Click the extension icon on this tab before playing the video",
            };
        }
        const currentSession = TranscriptStore.getCurrentSession();
        const isCurrentLecture = currentSession !== null &&
            currentSession.tabId === tabId &&
            TranscriptStore.isSameLectureContext(currentSession.context, lectureContext);
        if (!currentSession) {
            await TranscriptStore.startNewTranscriptSession(tabId, lectureContext);
        }
        else if (!isCurrentLecture) {
            if (TranscriptStore.hasTranscript() &&
                !confirmNewSession) {
                return {
                    ok: false,
                    requiresSessionConfirmation: true,
                    error: "Starting a new session will clear the current transcript",
                };
            }
            await TranscriptStore.startNewTranscriptSession(tabId, lectureContext);
        }
        if (capture.status === "recording") {
            return {
                ok: true,
                info: "Tab capture already recording",
            };
        }
        try {
            connectTranscriptWebSocket();
            await TabCaptureController.resumeTabCapturePath();
            await CaptureStore.updateCaptureStatus("recording");
            return {
                ok: true,
                info: "Tab capture recording started",
            };
        }
        catch (error) {
            const message = error instanceof Error
                ? error.message
                : "Failed to resume tab capture";
            return {
                ok: false,
                error: message,
            };
        }
    });
}
/**
 * Pause the active tab capture session.
 */
function pauseRecording() {
    return runRecordingOperation(async () => {
        const capture = await CaptureStore.getCaptureState();
        if (capture === null) {
            return {
                ok: true,
                info: "No active recording to pause",
            };
        }
        if (capture.status !== "recording") {
            return {
                ok: true,
                info: "Tab capture already paused",
            };
        }
        try {
            await TabCaptureController.pauseTabCapturePath();
            await CaptureStore.updateCaptureStatus("paused");
            return {
                ok: true,
                info: "Tab capture paused",
            };
        }
        catch (error) {
            const message = error instanceof Error
                ? error.message
                : "Failed to pause tab capture";
            return {
                ok: false,
                error: message,
            };
        }
    });
}
/**
 * Stop the active tab capture session.
 */
function endRecording() {
    return runRecordingOperation(async () => {
        const capture = await CaptureStore.getCaptureState();
        if (capture === null) {
            return {
                ok: true,
                info: "No active recording to stop",
            };
        }
        try {
            await TabCaptureController.stopTabCapturePath();
            await CaptureStore.clearCaptureState();
            return {
                ok: true,
                info: "Tab capture stopped",
            };
        }
        catch (error) {
            // Even if the stop path fails, drop the record so we never get stuck in a
            // permanent "recording" state that no longer reflects reality.
            await CaptureStore.clearCaptureState();
            const message = error instanceof Error
                ? error.message
                : "Failed to stop tab capture";
            return {
                ok: false,
                error: message,
            };
        }
    });
}
export const RecordingController = {
    isActiveRecordingTab,
    restoreCaptureState,
    beginRecordingForTab,
    resumeRecordingForTab,
    pauseRecording,
    endRecording,
};
