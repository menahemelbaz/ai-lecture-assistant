"use strict";
// Defines how long a video event may follow a click and still be user-initiated.
const CLICK_TO_VIDEO_EVENT = 2000;
// Delays pause handling to ignore brief playback interruptions.
const PAUSE_CONFIRMATION = 1000;
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
// Builds the metadata used to identify the current lecture session.
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
// Requests recording while preventing duplicate requests for the same video.
function requestRecordingStart(video, confirmNewSession = false) {
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
        // Reset the state so a later user-initiated playback can retry.
        if (!response?.ok) {
            videosStartedAfterUserClick.delete(video);
        }
    });
}
// Starts recording when capture is armed while the video is already playing.
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
// Track page clicks so nearby video events can be identified as user actions.
document.addEventListener("click", markUserClick, true);
// Handles extension activation, deactivation, and error messages from the background.
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "CAPTURE_ARMED") {
        // Avoid activating the extension UI when the page has no video.
        if (!ContentUI.hasVideo()) {
            window.alert("No video was detected on this page.");
            sendResponse({
                ok: false,
                error: "No video on page",
            });
            return true;
        }
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
    if (message.type === "CAPTURE_DISARMED") {
        ContentUI.hideExtensionButtons();
        sendResponse({
            ok: true,
            info: "Extension UI removed",
        });
        return true;
    }
    // A transcription error surfaced from the offscreen document. The
    // background sends a ready-to-show message; display it to the user.
    if (message.type === "CAPTURE_ERROR") {
        if (message.text) {
            ContentUI.showCaptureError(message.text);
        }
        sendResponse({
            ok: true,
            info: "Capture error shown",
        });
        return true;
    }
    return undefined;
});
window.Manager = {
    async setupExtension() {
        Buttons.createButtons();
        Controller.onClick();
    },
    // Marks restored playback as user-started without sending another start request.
    markVideoAsUserStarted(video) {
        videosStartedAfterUserClick.add(video);
    },
    startRecordingOnPlay(video) {
        // Prevent multiple playing listeners from being attached to the same video.
        if (videosWithPlayListener.has(video)) {
            return;
        }
        videosWithPlayListener.add(video);
        // Start recording only after playback initiated by a recent user action.
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
        // Prevent multiple pause listeners from being attached to the same video.
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
            // Confirm that playback remains paused before stopping the recording.
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
