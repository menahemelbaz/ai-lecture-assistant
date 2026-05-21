// Stores the currently active video element.
let currentVideo: HTMLVideoElement | null = null;

// Extension setup status.
let isExtensionSetUp = false;

// Finds the first video element on the page.
function findVideoElement(): HTMLVideoElement | null {
  return document.querySelector<HTMLVideoElement>("video");
}


function setupExtensionForVideo(video: HTMLVideoElement): void {
  // Prevents setting up the extension twice for the same video.
  if (currentVideo === video) {
    return;
  }

  currentVideo = video;

  // Sets up the extension only once.
  if (!isExtensionSetUp) {
    Manager.setupExtension();
    isExtensionSetUp = true;
  }

  // Start recording when the video begins playing.
  Manager.startRecordingOnPlay(video);

  // Stop recording when the video is paused.
  Manager.stopRecordingOnPause(video);
}

// Sets up the extension if a video element is found.
function setupExtension(): void {
  const video = findVideoElement();

  // Stops setup if no video element is found.
  if (!video) {
    return;
  }

  setupExtensionForVideo(video);
}

// Try once immediately.
setupExtension();

// Creates the buttons whenever the page structure changes.
const observer = new MutationObserver(() => {
  setupExtension();
});

// Observes page changes to detect a new video element.
observer.observe(document.documentElement, {
  childList: true,
  subtree: true,
});
