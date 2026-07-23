// Converts Chrome's callback-based messaging API into a typed Promise.
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
// Checks whether the offscreen audio-capture document currently exists.
async function hasOffscreenDocument() {
    const contexts = await chrome.runtime.getContexts({});
    return contexts.some((context) => context.contextType === "OFFSCREEN_DOCUMENT");
}
// Creates the offscreen document only when no existing instance is available.
async function ensureOffscreenDocument() {
    if (await hasOffscreenDocument()) {
        return;
    }
    await chrome.offscreen.createDocument({
        url: "offscreen.html",
        reasons: ["USER_MEDIA"],
        justification: "Capture tab audio for lecture transcription",
    });
}
// Closes the offscreen document when capture no longer requires it.
async function closeOffscreenDocumentIfOpen() {
    if (!(await hasOffscreenDocument())) {
        return;
    }
    await chrome.offscreen.closeDocument();
}
// Initializes tab capture and forwards the generated stream ID to the offscreen document.
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
// Stops audio capture before releasing the offscreen document.
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
export const TabCaptureController = {
    hasOffscreenDocument,
    startTabCapturePath,
    pauseTabCapturePath,
    resumeTabCapturePath,
    stopTabCapturePath,
};
