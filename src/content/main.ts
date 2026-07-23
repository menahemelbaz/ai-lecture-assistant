// Tracks the video element currently connected to the recording listeners.
let currentVideo: HTMLVideoElement | null = null;

// Prevents the floating controls from being created more than once.
let areButtonsCreated = false;

function findVideoElement(): HTMLVideoElement | null {
  return document.querySelector<HTMLVideoElement>("video");
}

// Connects recording listeners whenever a new video element is detected.
function attachRecordingListeners(video: HTMLVideoElement): void {
  if (currentVideo === video) {
    return;
  }

  currentVideo = video;

  Manager.startRecordingOnPlay(video);
  Manager.stopRecordingOnPause(video);
}

// Creates the extension controls once after capture is activated or restored.
function showExtensionButtons(): void {
  if (areButtonsCreated) {
    return;
  }

  Manager.setupExtension();
  areButtonsCreated = true;
}

// Removes every injected UI element so stale session content cannot reappear.
function hideExtensionButtons(): void {
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

function hasVideo(): boolean {
  return findVideoElement() !== null;
}

// Exposes content-script UI controls to the extension message handlers.
window.ContentUI = {
  showExtensionButtons,
  hideExtensionButtons,
  hasVideo,
};

// Pauses background capture when the restored page has no active playback.
function alignCaptureToPausedVideo(): void {
  chrome.runtime.sendMessage(
    { type: "STOP_RECORDING" },
    () => {
      // Read lastError to suppress warnings for this best-effort request.
      void chrome.runtime.lastError;
    }
  );
}

// Restores the extension UI and synchronizes capture after a page refresh.
function restoreActiveState(): void {
  chrome.runtime.sendMessage(
    { type: "IS_TAB_ACTIVE" },
    (response: RecordingResponse) => {
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
      } else {
        alignCaptureToPausedVideo();
      }
    }
  );
}

// Attaches listeners automatically without creating the extension controls.
function detectVideo(): void {
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