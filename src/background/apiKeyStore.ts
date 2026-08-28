// Centralized read access to the user's OpenAI API key.
//
// The key is written by the options page (src/options/options.ts) under the
// same storage key. Both the background service worker and the offscreen
// document read the key through this module so the storage access lives in one
// place instead of being duplicated per context.

const API_KEY_STORAGE_KEY = "openaiApiKey";

// Reads the saved OpenAI key, or null when the user has not stored one yet.
async function getApiKey(): Promise<string | null> {
    try {
        const result = await chrome.storage.local.get(API_KEY_STORAGE_KEY);
        const savedKey = result[API_KEY_STORAGE_KEY];

        if (typeof savedKey === "string" && savedKey.trim()) {
            return savedKey.trim();
        }

        return null;
    } catch (err) {
        console.error("Error reading the OpenAI API key:", err);
        return null;
    }
}

export const ApiKeyStore = {
    getApiKey,
};
