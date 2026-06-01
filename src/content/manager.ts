// Max time between user click and video event.
const CLICK_TO_VIDEO_EVENT = 2000;

// Delay before confirming the video is paused.
const PAUSE_CONFIRMATION = 1000;

// Track when the user last clicked.
let lastClickTime = 0;

const videosWithPlayListener = new WeakSet<HTMLVideoElement>();
const videosWithPauseListener = new WeakSet<HTMLVideoElement>();
const videosStartedAfterUserClick = new WeakSet<HTMLVideoElement>();
const pauseTimeouts = new WeakMap<HTMLVideoElement, number>();

function markUserClick(): void {
  lastClickTime = Date.now();
}

function didUserClickRecently(): boolean {
  const timeSinceLastClick = Date.now() - lastClickTime;

  return timeSinceLastClick <= CLICK_TO_VIDEO_EVENT;
}

function consumeLastClick(): void {
  lastClickTime = 0;
}

// Track user clicks on the page.
// If a video event happens shortly after a click, we treat it as user-initiated.
document.addEventListener("click", markUserClick, true);

window.Manager = {
  async setupExtension(): Promise<void> {
    // Create all extension buttons.
    Buttons.createButtons();

    // Attach click handlers to the extension buttons.
    Controller.onClick();
  },

  startRecordingOnPlay(video: HTMLVideoElement): void {
    // Prevent attaching the same playing listener more than once to the same video.
    if (videosWithPlayListener.has(video)) {
      return;
    }

    videosWithPlayListener.add(video);

    // Start recording only when the video starts playing shortly after a user click.
    video.addEventListener("playing", () => {
      const wasAlreadyStartedByUser = videosStartedAfterUserClick.has(video);

      if (!wasAlreadyStartedByUser) {
        if (!didUserClickRecently()) {
          console.log(
            "Ignoring playing event because no recent user click was detected."
          );
          return;
        }

        videosStartedAfterUserClick.add(video);
        consumeLastClick();
      }

      console.log("Video is playing after user click. Sending START_RECORDING.");

      chrome.runtime.sendMessage(
        { type: "START_RECORDING" },
        (response: RecordingResponse) => {
          // Check for any runtime errors.
          if (chrome.runtime.lastError) {
            console.warn(chrome.runtime.lastError.message);
            return;
          }

          if (!response?.ok && response?.error) {
            if (
              response.error ===
              "Click the extension icon on this tab before playing the video"
            ) {
              alert(
                "Please click the extension icon before starting the lecture."
              );
              return;
            }

            console.warn(response.error);
          }
        }
      );
    });
  },

  stopRecordingOnPause(video: HTMLVideoElement): void {
    // Prevent attaching the same pause listener more than once to the same video.
    if (videosWithPauseListener.has(video)) {
      return;
    }

    videosWithPauseListener.add(video);

    video.addEventListener("pause", () => {
      if (!videosStartedAfterUserClick.has(video)) {
        console.log(
          "Ignoring pause event because the video was not user-started."
        );
        return;
      }

      if (!didUserClickRecently()) {
        console.log(
          "Ignoring pause event because no recent user click was detected."
        );
        return;
      }

      consumeLastClick();

      console.log(
        "Video pause event detected after user click. Waiting before stopping."
      );

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

        chrome.runtime.sendMessage(
          { type: "STOP_RECORDING" },
          (response: RecordingResponse) => {
            // Check for any runtime errors.
            if (chrome.runtime.lastError) {
              console.warn(chrome.runtime.lastError.message);
              return;
            }

            if (!response?.ok && response?.error) {
              console.warn(response.error);
            }
          }
        );
      }, PAUSE_CONFIRMATION);

      pauseTimeouts.set(video, timeoutId);
    });
  },
};
