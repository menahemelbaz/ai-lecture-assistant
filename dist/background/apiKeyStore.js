// Centralized read access to the user's OpenAI API key.
//
// The key is written by the options page under this storage key. The background
// service worker has direct access to chrome.storage; the offscreen document
// does not, so from there the key is requested from the background over runtime
// messaging. getApiKey() selects the right path automatically.
const API_KEY_STORAGE_KEY = "openaiApiKey";
function normalizeKey(value) {
    return typeof value === "string" && value.trim() ? value.trim() : null;
}
// Direct read, used in contexts that have chrome.storage (the service worker).
async function readFromStorage() {
    const result = await chrome.storage.local.get(API_KEY_STORAGE_KEY);
    return normalizeKey(result[API_KEY_STORAGE_KEY]);
}
// Fallback for the offscreen document, which has no direct chrome.storage access.
function requestFromBackground() {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: "GET_API_KEY" }, (response) => {
            if (chrome.runtime.lastError) {
                console.error("Error requesting API key from background:", chrome.runtime.lastError.message);
                resolve(null);
                return;
            }
            resolve(normalizeKey(response?.apiKey));
        });
    });
}
async function getApiKey() {
    try {
        if (chrome.storage?.local) {
            return await readFromStorage();
        }
        return await requestFromBackground();
    }
    catch (err) {
        console.error("Error reading the OpenAI API key:", err);
        return null;
    }
}
export const ApiKeyStore = {
    getApiKey,
};
