"use strict";
// Stores the currently active video element.
let currentVideo = null;
// Whether the floating buttons UI has been created.
let areButtonsCreated = false;
// Finds the first video element on the page.
function findVideoElement() {
    return document.querySelector("video");
}
/**
 * Attach the recording listeners to a video. This is automatic on video
 * detection and is independent of whether the buttons UI is shown - the
 * listeners must always be ready so recording works once the user activates
 * the extension.
 */
function attachRecordingListeners(video) {
    if (currentVideo === video) {
        return;
    }
    currentVideo = video;
    Manager.startRecordingOnPlay(video);
    Manager.stopRecordingOnPause(video);
}
/**
 * Create the floating buttons UI, once. Called after the user clicks the
 * extension icon (via CAPTURE_ARMED), or on load if the tab is still active
 * (e.g. after a refresh while capture is running).
 */
function showExtensionButtons() {
    if (areButtonsCreated) {
        return;
    }
    Manager.setupExtension();
    areButtonsCreated = true;
}
/**
 * Remove ALL of the extension's injected UI from the DOM. Called on
 * deactivation (second icon click), returning the page to a clean state.
 *
 * This removes not only the floating buttons but also the chat panel and quiz
 * overlay, which are separate elements appended to the body. Otherwise their
 * old contents (e.g. previous chat bubbles) would linger and reappear when the
 * extension is turned on again, even though the stored session was cleared.
 */
function hideExtensionButtons() {
    const ids = [
        "wrapper-main-button",
        "lecture-chat-panel",
        "lecture-quiz-overlay",
    ];
    for (const id of ids) {
        const element = document.getElementById(id);
        if (element) {
            element.remove();
        }
    }
    areButtonsCreated = false;
}
/**
 * Whether a video is currently present on the page.
 */
function hasVideo() {
    return findVideoElement() !== null;
}
// Expose the button controls to the Manager (used by the CAPTURE_ARMED /
// CAPTURE_DISARMED handlers).
window.ContentUI = {
    showExtensionButtons,
    hideExtensionButtons,
    hasVideo,
};
/**
 * Tell the background to pause capture, to align the running capture with a
 * paused video after a refresh (so it doesn't keep capturing silence).
 */
function alignCaptureToPausedVideo() {
    chrome.runtime.sendMessage({ type: "STOP_RECORDING" }, () => {
        // Ignore the result: this is a best-effort alignment. lastError is read
        // to avoid an unchecked-error warning.
        void chrome.runtime.lastError;
    });
}
/**
 * On load (including after a tab refresh), ask the background whether this tab
 * is still an active capture tab. If it is, the buttons were lost with the page
 * reload but capture is still running in the background - so restore the UI and
 * align the capture with the current video state.
 */
function restoreActiveState() {
    chrome.runtime.sendMessage({ type: "IS_TAB_ACTIVE" }, (response) => {
        if (chrome.runtime.lastError) {
            // Background not reachable yet; nothing to restore.
            return;
        }
        if (!response?.active) {
            return;
        }
        // The tab is still an active capture tab. Restore the buttons UI.
        showExtensionButtons();
        const video = findVideoElement();
        // After a refresh the video is usually paused, but the background capture
        // kept running. Align them:
        // - If the video is playing, mark it as user-started so the normal pause
        //   listener will later stop recording, and let capture continue.
        // - Otherwise (paused / no video yet), pause the capture so it doesn't
        //   record silence until the user plays again.
        if (video && !video.paused && !video.ended) {
            Manager.markVideoAsUserStarted(video);
        }
        else {
            alignCaptureToPausedVideo();
        }
    });
}
// Detect a video and attach recording listeners automatically. This does NOT
// create the buttons - that happens only after the user clicks the icon (or on
// restore, if the tab is already active).
function detectVideo() {
    const video = findVideoElement();
    if (!video) {
        return;
    }
    attachRecordingListeners(video);
}
// Try once immediately.
detectVideo();
// If this tab is still active (e.g. after a refresh), bring the buttons back.
restoreActiveState();
// Keep watching for a video appearing later (dynamic pages).
const observer = new MutationObserver(() => {
    detectVideo();
});
observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
});
