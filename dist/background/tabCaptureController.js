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
export const TabCaptureController = {
    startTabCapturePath,
    pauseTabCapturePath,
    resumeTabCapturePath,
    stopTabCapturePath,
};
