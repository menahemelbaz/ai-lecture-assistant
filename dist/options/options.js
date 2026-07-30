"use strict";
const API_KEY_STORAGE_KEY = "openaiApiKey";
/**
 * Show a status message with a success or error style.
 */
function showStatus(message, kind) {
    const status = document.getElementById("status-message");
    if (!status) {
        return;
    }
    status.textContent = message;
    status.classList.remove("success", "error");
    status.classList.add(kind);
}
/**
 * Basic shape check: OpenAI keys start with "sk-". This is a format check only,
 * not a validity check against the API (that comes in a later step).
 */
function looksLikeApiKey(value) {
    return value.startsWith("sk-") && value.length > 20;
}
/**
 * Load any saved key into the input on page open.
 */
async function loadSavedKey() {
    try {
        const result = await chrome.storage.local.get(API_KEY_STORAGE_KEY);
        const savedKey = result[API_KEY_STORAGE_KEY];
        if (typeof savedKey === "string" && savedKey) {
            const input = document.getElementById("api-key-input");
            input.value = savedKey;
            showStatus("Saved key loaded.", "success");
        }
    }
    catch (err) {
        console.error("Error loading saved key:", err);
    }
}
/**
 * Save the entered key to local storage.
 */
async function saveKey() {
    const input = document.getElementById("api-key-input");
    const key = input.value.trim();
    if (!key) {
        showStatus("Please enter a key.", "error");
        return;
    }
    if (!looksLikeApiKey(key)) {
        showStatus("This does not look like a valid key. OpenAI keys start with sk-.", "error");
        return;
    }
    try {
        await chrome.storage.local.set({ [API_KEY_STORAGE_KEY]: key });
        showStatus("Key saved successfully.", "success");
    }
    catch (err) {
        console.error("Error saving key:", err);
        showStatus("Error saving the key.", "error");
    }
}
/**
 * Remove the saved key.
 */
async function clearKey() {
    try {
        await chrome.storage.local.remove(API_KEY_STORAGE_KEY);
        const input = document.getElementById("api-key-input");
        input.value = "";
        showStatus("Key removed.", "success");
    }
    catch (err) {
        console.error("Error clearing key:", err);
        showStatus("Error removing the key.", "error");
    }
}
/**
 * Toggle showing the key as plain text.
 */
function toggleVisibility() {
    const input = document.getElementById("api-key-input");
    input.type = input.type === "password" ? "text" : "password";
}
// Wire up the page.
document.addEventListener("DOMContentLoaded", () => {
    loadSavedKey();
    const saveButton = document.getElementById("save-button");
    const clearButton = document.getElementById("clear-button");
    const toggleButton = document.getElementById("toggle-visibility");
    saveButton?.addEventListener("click", saveKey);
    clearButton?.addEventListener("click", clearKey);
    toggleButton?.addEventListener("click", toggleVisibility);
});
