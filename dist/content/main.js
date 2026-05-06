"use strict";
// Select the video element from the page
const video = document.querySelector("video");
// Check if a video element exists
if (video) {
    // Set up the extension components
    Manager.setupExtension();
    // Start recording when the video begins playing
    Manager.startRecordingOnPlay(video);
    // Stop recording when the video is paused
    Manager.stopRecordingOnPause(video);
}
