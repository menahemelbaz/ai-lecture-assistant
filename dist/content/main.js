"use strict";
// Tracks the video element currently connected to the recording listeners.
let currentVideo = null;
// Prevents the floating controls from being created more than once.
let areButtonsCreated = false;
function findVideoElement() {
    return document.querySelector("video");
}
// Connects recording listeners whenever a new video element is detected.
function attachRecordingListeners(video) {
    if (currentVideo === video) {
        return;
    }
    currentVideo = video;
    Manager.startRecordingOnPlay(video);
    Manager.stopRecordingOnPause(video);
}
// Creates the extension controls once after capture is activated or restored.
function showExtensionButtons() {
    if (areButtonsCreated) {
        return;
    }
    Manager.setupExtension();
    areButtonsCreated = true;
}
// Removes every injected UI element so stale session content cannot reappear.
function hideExtensionButtons() {
    const ids = [
        "wrapper-main-button",
        "lecture-chat-panel",
        "lecture-quiz-overlay",
        "lecture-capture-error",
    ];
    for (const id of ids) {
        const element = document.getElementById(id);
        if (element) {
            element.remove();
        }
    }
    areButtonsCreated = false;
}
function hasVideo() {
    return findVideoElement() !== null;
}
// Removes the capture-error banner if it is currently shown.
function dismissCaptureError() {
    const banner = document.getElementById("lecture-capture-error");
    if (banner) {
        banner.remove();
    }
}
// Shows a persistent banner describing a transcription problem. The banner
// stays until the user dismisses it, and offers a shortcut to the options page.
function showCaptureError(message) {
    // Reuse a single banner element so repeated errors don't stack.
    dismissCaptureError();
    const banner = document.createElement("div");
    banner.id = "lecture-capture-error";
    const icon = document.createElement("span");
    icon.className = "lecture-error-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = "!";
    const body = document.createElement("div");
    body.className = "lecture-error-body";
    const text = document.createElement("p");
    text.className = "lecture-error-text";
    text.textContent = message;
    const settingsButton = document.createElement("button");
    settingsButton.className = "lecture-error-action";
    settingsButton.type = "button";
    settingsButton.textContent = "Open settings";
    settingsButton.addEventListener("click", () => {
        chrome.runtime.sendMessage({ type: "OPEN_OPTIONS" }, () => {
            void chrome.runtime.lastError;
        });
    });
    body.appendChild(text);
    body.appendChild(settingsButton);
    const closeButton = document.createElement("button");
    closeButton.className = "lecture-error-close";
    closeButton.type = "button";
    closeButton.setAttribute("aria-label", "Dismiss");
    closeButton.textContent = "✕";
    closeButton.addEventListener("click", dismissCaptureError);
    banner.appendChild(icon);
    banner.appendChild(body);
    banner.appendChild(closeButton);
    document.body.appendChild(banner);
}
// Exposes content-script UI controls to the extension message handlers.
window.ContentUI = {
    showExtensionButtons,
    hideExtensionButtons,
    hasVideo,
    showCaptureError,
};
// Pauses background capture when the restored page has no active playback.
function alignCaptureToPausedVideo() {
    chrome.runtime.sendMessage({ type: "STOP_RECORDING" }, () => {
        // Read lastError to suppress warnings for this best-effort request.
        void chrome.runtime.lastError;
    });
}
// Restores the extension UI and synchronizes capture after a page refresh.
function restoreActiveState() {
    chrome.runtime.sendMessage({ type: "IS_TAB_ACTIVE" }, (response) => {
        if (chrome.runtime.lastError) {
            return;
        }
        if (!response?.active) {
            return;
        }
        showExtensionButtons();
        const video = findVideoElement();
        // Continue an active playback session or pause capture until playback resumes.
        if (video && !video.paused && !video.ended) {
            Manager.markVideoAsUserStarted(video);
        }
        else {
            alignCaptureToPausedVideo();
        }
    });
}
// Attaches listeners automatically without creating the extension controls.
function detectVideo() {
    const video = findVideoElement();
    if (!video) {
        return;
    }
    attachRecordingListeners(video);
}
// Detect a video already present when the content script loads.
detectVideo();
// Restore the controls when the tab remains active after a refresh.
restoreActiveState();
// Watch dynamic pages for video elements added after the initial load.
const observer = new MutationObserver(() => {
    detectVideo();
});
observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
});
