"use strict";
// Max time between user click and video event.
const CLICK_TO_VIDEO_EVENT = 2000;
// Delay before confirming the video is paused.
const PAUSE_CONFIRMATION = 1000;
// Track when the user last clicked.
let lastClickTime = 0;
const videosWithPlayListener = new WeakSet();
const videosWithPauseListener = new WeakSet();
const videosStartedAfterUserClick = new WeakSet();
const videosWithPendingStartRequest = new WeakSet();
const pauseTimeouts = new WeakMap();
function markUserClick() {
    lastClickTime = Date.now();
}
function didUserClickRecently() {
    const timeSinceLastClick = Date.now() - lastClickTime;
    return timeSinceLastClick <= CLICK_TO_VIDEO_EVENT;
}
function consumeLastClick() {
    lastClickTime = 0;
}
/**
 * Build the context used to identify the current lecture.
 */
function getLectureContext(video) {
    const duration = video.duration;
    return {
        pageUrl: window.location.href,
        pageTitle: document.title,
        videoSrc: video.currentSrc || video.src || null,
        videoDuration: Number.isFinite(duration) && duration > 0
            ? Math.round(duration)
            : null,
    };
}
/**
 * Request recording for the current lecture.
 */
function requestRecordingStart(video, confirmNewSession = false) {
    // Prevent simultaneous duplicate requests for the same video.
    if (videosWithPendingStartRequest.has(video)) {
        return;
    }
    videosWithPendingStartRequest.add(video);
    chrome.runtime.sendMessage({
        type: "START_RECORDING",
        lectureContext: getLectureContext(video),
        confirmNewSession,
    }, (response) => {
        videosWithPendingStartRequest.delete(video);
        if (chrome.runtime.lastError) {
            console.warn(chrome.runtime.lastError.message);
            videosStartedAfterUserClick.delete(video);
            return;
        }
        if (response?.requiresSessionConfirmation) {
            const confirmed = window.confirm("A new lecture was detected.\n\n" +
                "Starting a new session will permanently delete " +
                "the current transcript.\n\n" +
                "Do you want to continue?");
            if (confirmed) {
                requestRecordingStart(video, true);
            }
            else {
                videosStartedAfterUserClick.delete(video);
            }
            return;
        }
        // Recording could not start for some other reason. Reset the flag so a
        // later user-initiated play can try again. No user-facing warning here:
        // in the new activation flow the common failure cases are handled
        // elsewhere.
        if (!response?.ok) {
            videosStartedAfterUserClick.delete(video);
        }
    });
}
/**
 * Start recording immediately if capture was armed while the video
 * was already playing.
 */
function startRecordingIfVideoIsAlreadyPlaying() {
    const video = document.querySelector("video");
    if (!video || video.paused || video.ended) {
        return false;
    }
    videosStartedAfterUserClick.add(video);
    consumeLastClick();
    console.log("Tab capture was armed while the video was already playing. " +
        "Sending START_RECORDING.");
    requestRecordingStart(video);
    return true;
}
// Track user clicks on the page.
// If a video event happens shortly after a click, treat it as user-initiated.
document.addEventListener("click", markUserClick, true);
// Receive notifications from the background about activation / deactivation.
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    // Activation: the user clicked the extension icon.
    if (message.type === "CAPTURE_ARMED") {
        // Only activate the UI if a video is actually present on the page.
        if (!ContentUI.hasVideo()) {
            window.alert("לא זוהה וידאו בעמוד.");
            sendResponse({
                ok: false,
                error: "No video on page",
            });
            return true;
        }
        // Video present: show the buttons and, if it is already playing, begin.
        ContentUI.showExtensionButtons();
        const recordingRequested = startRecordingIfVideoIsAlreadyPlaying();
        sendResponse({
            ok: true,
            info: recordingRequested
                ? "Recording requested for the playing video"
                : "Buttons shown and waiting for the video to play",
        });
        return true;
    }
    // Deactivation: the user clicked the icon again to turn the extension off.
    if (message.type === "CAPTURE_DISARMED") {
        ContentUI.hideExtensionButtons();
        sendResponse({
            ok: true,
            info: "Extension UI removed",
        });
        return true;
    }
    return undefined;
});
window.Manager = {
    async setupExtension() {
        // Create all extension buttons.
        Buttons.createButtons();
        // Attach click handlers to the extension buttons.
        Controller.onClick();
    },
    /**
     * Mark a video as user-started without sending a new recording request.
     * Used after a refresh when the video is already playing and capture is
     * already running in the background - so the pause listener will correctly
     * stop recording when the user later pauses.
     */
    markVideoAsUserStarted(video) {
        videosStartedAfterUserClick.add(video);
    },
    startRecordingOnPlay(video) {
        // Prevent duplicate playing listeners on the same video.
        if (videosWithPlayListener.has(video)) {
            return;
        }
        videosWithPlayListener.add(video);
        // Start recording only after a user-initiated video play.
        video.addEventListener("playing", () => {
            const wasAlreadyStartedByUser = videosStartedAfterUserClick.has(video);
            if (!wasAlreadyStartedByUser) {
                if (!didUserClickRecently()) {
                    console.log("Ignoring playing event because no recent user click was detected.");
                    return;
                }
                videosStartedAfterUserClick.add(video);
                consumeLastClick();
            }
            console.log("Video is playing after user click. Sending START_RECORDING.");
            requestRecordingStart(video);
        });
    },
    stopRecordingOnPause(video) {
        // Prevent duplicate pause listeners on the same video.
        if (videosWithPauseListener.has(video)) {
            return;
        }
        videosWithPauseListener.add(video);
        video.addEventListener("pause", () => {
            if (!videosStartedAfterUserClick.has(video)) {
                console.log("Ignoring pause event because the video was not user-started.");
                return;
            }
            if (!didUserClickRecently()) {
                console.log("Ignoring pause event because no recent user click was detected.");
                return;
            }
            consumeLastClick();
            console.log("Video pause event detected after user click. Waiting before stopping.");
            const existingTimeoutId = pauseTimeouts.get(video);
            if (existingTimeoutId !== undefined) {
                window.clearTimeout(existingTimeoutId);
            }
            const timeoutId = window.setTimeout(() => {
                if (!video.paused) {
                    console.log("Video resumed quickly. Ignoring pause event.");
                    return;
                }
                console.log("Video is still paused. Sending STOP_RECORDING.");
                chrome.runtime.sendMessage({
                    type: "STOP_RECORDING",
                }, (response) => {
                    if (chrome.runtime.lastError) {
                        console.warn(chrome.runtime.lastError.message);
                        return;
                    }
                    if (!response?.ok && response?.error) {
                        console.warn(response.error);
                    }
                });
            }, PAUSE_CONFIRMATION);
            pauseTimeouts.set(video, timeoutId);
        });
    },
};
