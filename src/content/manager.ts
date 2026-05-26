window.Manager = {
  async setupExtension(): Promise<void> {
    // Create all buttons
    Buttons.createButtons();

    // Create a click event for each button
    Controller.onClick();
  },

  startRecordingOnPlay(video: HTMLVideoElement): void {
    // Start recording only when the video is actually playing.
    video.addEventListener("playing", () => {
      console.log("Video is playing. Sending START_RECORDING.");

      chrome.runtime.sendMessage(
        { type: "START_RECORDING" },
        (response: RecordingResponse) => {
          // Check for any runtime errors
          if (chrome.runtime.lastError) {
            console.warn(chrome.runtime.lastError.message);
            return;
          }

          if (!response?.ok && response?.error) {
            if (
              response.error ===
              "Click the extension icon on this tab before playing the video"
            ) {
              return;
            }

            console.warn(response.error);
          }
        }
      );
    });
  },

  stopRecordingOnPause(video: HTMLVideoElement): void {
    // Pause events can happen temporarily on dynamic video sites.
    video.addEventListener("pause", () => {
      console.log("Video pause event detected. Waiting before stopping.");

      window.setTimeout(() => {
        if (!video.paused) {
          console.log("Video is playing again. STOP_RECORDING was ignored.");
          return;
        }

        if (video.ended) {
          console.log("Video ended. Sending STOP_RECORDING.");
        } else {
          console.log("Video is still paused. Sending STOP_RECORDING.");
        }

        chrome.runtime.sendMessage(
          { type: "STOP_RECORDING" },
          (response: RecordingResponse) => {
            // Check for any runtime errors
            if (chrome.runtime.lastError) {
              console.warn(chrome.runtime.lastError.message);
              return;
            }

            if (!response?.ok && response?.error) {
              console.warn(response.error);
            }
          }
        );
      }, 700);
    });
  },
};
