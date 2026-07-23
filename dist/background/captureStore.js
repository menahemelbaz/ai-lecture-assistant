const CAPTURE_STATE_STORAGE_KEY = "activeCaptureState";
// Verifies that a value loaded from storage is a valid capture record.
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
// Reads the persisted state used to restore capture after a service worker restart.
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
// Persists a capture record or removes the stored state when passed null.
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
// Updates the status and timestamp of the currently stored capture record.
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
// Removes the persisted capture state after recording ends.
async function clearCaptureState() {
    await setCaptureState(null);
}
export const CaptureStore = {
    getCaptureState,
    setCaptureState,
    updateCaptureStatus,
    clearCaptureState,
};
