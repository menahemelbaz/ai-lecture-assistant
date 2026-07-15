const CAPTURE_STATE_STORAGE_KEY = "activeCaptureState";
/**
 * Validate that a stored value is a well-formed capture record.
 */
function isCaptureRecord(value) {
    if (!value || typeof value !== "object") {
        return false;
    }
    const record = value;
    return (record.mode === "tab" &&
        (record.status === "armed" ||
            record.status === "recording" ||
            record.status === "paused") &&
        typeof record.tabId === "number" &&
        typeof record.updatedAt === "number");
}
/**
 * Read the persisted capture record. Storage is the single source of truth,
 * so this is safe to call after the service worker has been restarted.
 */
async function getCaptureState() {
    try {
        const result = await chrome.storage.local.get(CAPTURE_STATE_STORAGE_KEY);
        const stored = result[CAPTURE_STATE_STORAGE_KEY];
        return isCaptureRecord(stored) ? stored : null;
    }
    catch (err) {
        console.error("Error loading capture state:", err);
        return null;
    }
}
/**
 * Persist a capture record, or clear it entirely when passed null.
 */
async function setCaptureState(record) {
    try {
        if (record === null) {
            await chrome.storage.local.remove(CAPTURE_STATE_STORAGE_KEY);
            return;
        }
        await chrome.storage.local.set({
            [CAPTURE_STATE_STORAGE_KEY]: record,
        });
    }
    catch (err) {
        console.error("Error saving capture state:", err);
    }
}
/**
 * Update only the status of the existing capture record.
 */
async function updateCaptureStatus(status) {
    const current = await getCaptureState();
    if (!current) {
        return;
    }
    await setCaptureState({
        ...current,
        status,
        updatedAt: Date.now(),
    });
}
/**
 * Remove the capture record. Called when recording stops or is reconciled away.
 */
async function clearCaptureState() {
    await setCaptureState(null);
}
export const CaptureStore = {
    getCaptureState,
    setCaptureState,
    updateCaptureStatus,
    clearCaptureState,
};
