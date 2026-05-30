import { AudioCaptureController } from "./offscreen/audioCaptureController.js";

chrome.runtime.onMessage.addListener(
  (
    message: ExtensionMessage,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: InternalCaptureResponse) => void
  ) => {
    if (message.target !== "offscreen") {
      return;
    }

    (async () => {
      if (message.type === "START_TAB_CAPTURE_INTERNAL") {
        if (!message.streamId) {
          return {
            ok: false,
            error: "Missing streamId",
          };
        }

        await AudioCaptureController.startTabCapture(message.streamId);

        return {
          ok: true,
        };
      }

      if (message.type === "PAUSE_TAB_CAPTURE_INTERNAL") {
        await AudioCaptureController.pauseTabCapture();

        return {
          ok: true,
        };
      }

      if (message.type === "RESUME_TAB_CAPTURE_INTERNAL") {
        await AudioCaptureController.resumeTabCapture();

        return {
          ok: true,
        };
      }

      if (message.type === "STOP_TAB_CAPTURE_INTERNAL") {
        await AudioCaptureController.stopTabCapture();

        return {
          ok: true,
        };
      }

      return {
        ok: false,
        error: "Unknown offscreen message type",
      };
    })()
      .then(sendResponse)
      .catch((error: unknown) => {
        const message =
          error instanceof Error ? error.message : "Unexpected offscreen error";

        sendResponse({
          ok: false,
          error: message,
        });
      });

    return true;
  }
);
