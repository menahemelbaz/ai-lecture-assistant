const API_KEY_STORAGE_KEY = "openaiApiKey";
const PRIVACY_CONSENT_STORAGE_KEY = "privacyConsentAccepted";

// How long the primary button shows the "Saved ✓" confirmation.
const SAVED_FEEDBACK_MS = 1600;

/**
 * Show a status message with a success or error style.
 */
function showStatus(message: string, kind: "success" | "error"): void {
    const status = document.getElementById(
        "status-message"
    ) as HTMLParagraphElement | null;

    if (!status) {
        return;
    }

    status.textContent = message;
    status.classList.remove("success", "error");
    status.classList.add(kind);
}

/**
 * Reflect whether a key is currently saved: the header connection badge, the
 * primary button label, and whether the Remove button is shown at all.
 */
function reflectKeyPresence(isSet: boolean): void {
    const badge = document.getElementById("connection-badge");
    if (badge) {
        badge.textContent = isSet ? "Connected" : "Not connected";
        badge.classList.toggle("is-connected", isSet);
    }

    const saveButton = document.getElementById("save-button");
    if (saveButton && !saveButton.classList.contains("is-saved")) {
        saveButton.textContent = isSet ? "Update key" : "Save API key";
    }

    const clearButton = document.getElementById(
        "clear-button"
    ) as HTMLButtonElement | null;

    if (clearButton) {
        clearButton.hidden = !isSet;
    }
}

/**
 * Briefly show a "Saved ✓" confirmation on the primary button, then restore it.
 */
function flashSaved(): void {
    const saveButton = document.getElementById("save-button");

    if (!saveButton) {
        return;
    }

    saveButton.classList.add("is-saved");
    saveButton.textContent = "Saved ✓";

    setTimeout(() => {
        saveButton.classList.remove("is-saved");
        saveButton.textContent = "Update key";
    }, SAVED_FEEDBACK_MS);
}

/**
 * Basic shape check: OpenAI keys start with "sk-". This is a format check only,
 * not a validity check against the API.
 */
function looksLikeApiKey(value: string): boolean {
    return value.startsWith("sk-") && value.length > 20;
}

/**
 * Load the saved key and privacy-consent state when the page opens.
 */
async function loadSavedKey(): Promise<void> {
    try {
        const result = await chrome.storage.local.get([
            API_KEY_STORAGE_KEY,
            PRIVACY_CONSENT_STORAGE_KEY,
        ]);

        const savedKey = result[API_KEY_STORAGE_KEY];
        const isSet = typeof savedKey === "string" && savedKey.length > 0;

        const input = document.getElementById(
            "api-key-input"
        ) as HTMLInputElement | null;

        if (input && isSet) {
            input.value = savedKey;
        }

        const consentCheckbox = document.getElementById(
            "privacy-consent"
        ) as HTMLInputElement | null;

        if (consentCheckbox) {
            consentCheckbox.checked =
                result[PRIVACY_CONSENT_STORAGE_KEY] === true;
        }

        reflectKeyPresence(isSet);
    } catch (err) {
        console.error("Error loading saved settings:", err);
    }
}

/**
 * Save the entered key after privacy consent has been accepted.
 */
async function saveKey(): Promise<void> {
    const input = document.getElementById(
        "api-key-input"
    ) as HTMLInputElement;

    const consentCheckbox = document.getElementById(
        "privacy-consent"
    ) as HTMLInputElement | null;

    const key = input.value.trim();

    if (!consentCheckbox?.checked) {
        showStatus(
            "Please review and accept the privacy disclosure before saving.",
            "error"
        );
        return;
    }

    if (!key) {
        showStatus("Please enter a key.", "error");
        return;
    }

    if (!looksLikeApiKey(key)) {
        showStatus(
            "This does not look like a valid key. OpenAI keys start with sk-.",
            "error"
        );
        return;
    }

    try {
        await chrome.storage.local.set({
            [API_KEY_STORAGE_KEY]: key,
            [PRIVACY_CONSENT_STORAGE_KEY]: true,
        });

        showStatus("API key saved successfully.", "success");
        reflectKeyPresence(true);
        flashSaved();
    } catch (err) {
        console.error("Error saving key:", err);
        showStatus("Error saving the key.", "error");
    }
}

/**
 * Remove the saved key.
 */
async function clearKey(): Promise<void> {
    try {
        await chrome.storage.local.remove(API_KEY_STORAGE_KEY);

        const input = document.getElementById(
            "api-key-input"
        ) as HTMLInputElement;

        input.value = "";
        showStatus("API key removed.", "success");
        reflectKeyPresence(false);
    } catch (err) {
        console.error("Error clearing key:", err);
        showStatus("Error removing the key.", "error");
    }
}

/**
 * Toggle showing the key as plain text.
 */
function toggleVisibility(): void {
    const input = document.getElementById(
        "api-key-input"
    ) as HTMLInputElement;

    input.type = input.type === "password" ? "text" : "password";
}

// Wire up the page.
document.addEventListener("DOMContentLoaded", () => {
    loadSavedKey();

    const saveButton = document.getElementById("save-button");
    const clearButton = document.getElementById("clear-button");
    const toggleButton = document.getElementById("toggle-visibility");

    const consentCheckbox = document.getElementById(
        "privacy-consent"
    ) as HTMLInputElement | null;

    saveButton?.addEventListener("click", saveKey);
    clearButton?.addEventListener("click", clearKey);
    toggleButton?.addEventListener("click", toggleVisibility);

    consentCheckbox?.addEventListener("change", async () => {
        try {
            if (consentCheckbox.checked) {
                await chrome.storage.local.set({
                    [PRIVACY_CONSENT_STORAGE_KEY]: true,
                });

                showStatus(
                    "Privacy disclosure accepted. You can now save your API key.",
                    "success"
                );
                return;
            }

            await chrome.storage.local.remove([
                PRIVACY_CONSENT_STORAGE_KEY,
                API_KEY_STORAGE_KEY,
            ]);

            const input = document.getElementById(
                "api-key-input"
            ) as HTMLInputElement | null;

            if (input) {
                input.value = "";
            }

            reflectKeyPresence(false);
            showStatus(
                "Privacy consent withdrawn. AI features are disabled.",
                "error"
            );
        } catch (err) {
            console.error("Error updating privacy consent:", err);
            showStatus("Error updating privacy consent.", "error");
        }
    });
});