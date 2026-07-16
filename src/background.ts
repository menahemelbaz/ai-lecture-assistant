import { TranscriptStore } from "./background/transcriptStore.js";
import { SummaryClient } from "./background/summaryClient.js";
import { AskLectureClient } from "./background/askLectureClient.js";
import { RecordingController } from "./background/recordingController.js";

// Load the transcript state first, then reconcile the recording state with the
// live offscreen document. Ordering matters: transcript state must be ready
// before the WebSocket may start appending chunks again.
TranscriptStore.loadTranscriptState()
  .then(() => RecordingController.restoreCaptureState())
  .catch((err) => {
    console.error("Failed to initialize background state:", err);
  });

chrome.action.onClicked.addListener(async (tab) => {
  const tabId = tab.id;

  if (tabId === undefined) {
    console.error("Could not identify the clicked tab");
    return;
  }

  if (await RecordingController.isActiveRecordingTab(tabId)) {
    const stopResponse = await RecordingController.endRecording();

    if (!stopResponse.ok) {
      console.error(
        "Error stopping recording from action click:",
        stopResponse.error
      );
    }

    return;
  }

  const startResponse =
    await RecordingController.beginRecordingForTab(tabId);

  if (!startResponse.ok) {
    console.error(
      "Error arming tab capture from action click:",
      startResponse.error
    );
    return;
  }

  // Notify the content script that capture is armed.
  // If the video is already playing, the content script will immediately
  // request that recording begin without waiting for another playing event.
  try {
    await chrome.tabs.sendMessage(tabId, {
      type: "CAPTURE_ARMED",
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Could not notify the content script";

    console.warn(
      "Tab capture was armed, but the content script could not be notified:",
      message
    );
  }
});

// Central message router invoked by the content scripts injected into tabs.
chrome.runtime.onMessage.addListener(
  (
    msg: ExtensionMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (
      response:
        | RecordingResponse
        | SummaryResponse
        | AskLectureResponse
        | InternalCaptureResponse
    ) => void
  ) => {
    if (msg.target === "offscreen") {
      return;
    }

    (async () => {
      if (msg && msg.type === "START_RECORDING") {
        const tabId = sender.tab?.id;

        if (tabId === undefined) {
          return {
            ok: false,
            error: "Could not identify the active tab",
          };
        }

        const lectureContext = msg.lectureContext;

        if (!lectureContext) {
          return {
            ok: false,
            error: "Lecture context was not provided",
          };
        }

        return await RecordingController.resumeRecordingForTab(
          tabId,
          lectureContext,
          msg.confirmNewSession === true
        );
      }

      if (msg && msg.type === "STOP_RECORDING") {
        return await RecordingController.pauseRecording();
      }

      if (msg && msg.type === "ASK_LECTURE") {
        const requesterTabId = sender.tab?.id;
        const activeTabId = TranscriptStore.getActiveTabId();
        const question = msg.question?.trim();

        if (!question) {
          return {
            ok: false,
            error: "לא התקבלה שאלה תקינה.",
          };
        }

        let fullTranscript = "";

        if (
          requesterTabId !== undefined &&
          requesterTabId === activeTabId
        ) {
          fullTranscript =
            await TranscriptStore.getFullTranscript();
        } else {
          console.warn(
            "ASK_LECTURE was sent without an active transcript session for this tab."
          );
        }

        return await AskLectureClient.askLecture(
          question,
          fullTranscript
        );
      }

      if (msg && msg.type === "GENERATE_SUMMARY") {
        const requesterTabId = sender.tab?.id;
        const activeTabId = TranscriptStore.getActiveTabId();

        if (
          requesterTabId === undefined ||
          requesterTabId !== activeTabId
        ) {
          return {
            ok: false,
            error: "No active transcript session for this tab",
          };
        }

        const fullTranscript =
          await TranscriptStore.getFullTranscript();

        if (!fullTranscript) {
          return {
            ok: false,
            error:
              "אין תמלול זמין לסיכום, אנא הפעל הקלטה תחילה",
          };
        }

        return await SummaryClient.generateSummaryPdf(
          fullTranscript
        );
      }

      return {
        ok: false,
        error: "Unknown message type",
      };
    })()
      .then(sendResponse)
      .catch((err: unknown) => {
        const errorMessage =
          err instanceof Error
            ? err.message
            : "Unexpected background error";

        sendResponse({
          ok: false,
          error: errorMessage,
        });
      });

    return true;
  }
);
