window.Manager = {
  async setupExtension(): Promise<void> {
    // Create all buttons
    Buttons.createButtons();

    // Create a click event for each button
    Controller.onClick();
  },

  startRecordingOnPlay(video: HTMLVideoElement): void {
    // Create an event triggered by the play action
    video.addEventListener("play", () => {
      // Send a request to start recording
      chrome.runtime.sendMessage({ type: "START_RECORDING" }, () => {
        // Check for any runtime errors
        if (chrome.runtime.lastError) {
          return;
        }
      });
    });
  },

  stopRecordingOnPause(video: HTMLVideoElement): void {
    // Create an event triggered by the pause action
    video.addEventListener("pause", () => {
      chrome.runtime.sendMessage({ type: "STOP_RECORDING" }, () => {
        // Check for any runtime errors
        if (chrome.runtime.lastError) {
          return;
        }
      });
    });
  },
};