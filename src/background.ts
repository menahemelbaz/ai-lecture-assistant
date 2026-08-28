import { TranscriptStore } from "./background/transcriptStore.js";
import { SummaryClient } from "./background/summaryClient.js";
import { AskLectureClient } from "./background/askLectureClient.js";
import { QuizClient } from "./background/quizClient.js";
import { RecordingController } from "./background/recordingController.js";

// Restore the transcript before capture resumes so incoming WebSocket chunks
// are appended only after the persisted state is available.
TranscriptStore.loadTranscriptState()
  .then(() => RecordingController.restoreCaptureState())
  .catch((err) => {
    console.error("Failed to initialize background state:", err);
  });

// Open the options page on first install so the user can add their API key
// before trying to use the extension.
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    chrome.runtime.openOptionsPage();
  }
});

chrome.action.onClicked.addListener(async (tab) => {
  const tabId = tab.id;

  if (tabId === undefined) {
    console.error("Could not identify the clicked tab");
    return;
  }

  // A second click on the active tab disables capture and removes its UI.
  if (await RecordingController.isActiveRecordingTab(tabId)) {
    const stopResponse = await RecordingController.endRecording();

    if (!stopResponse.ok) {
      console.error(
        "Error stopping recording from action click:",
        stopResponse.error
      );
    }

    try {
      await chrome.tabs.sendMessage(tabId, {
        type: "CAPTURE_DISARMED",
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Could not notify the content script";

      console.warn(
        "Recording stopped, but the content script could not be notified:",
        message
      );
    }

    return;
  }

  // A first click arms capture before requesting the content-script UI.
  const startResponse = await RecordingController.beginRecordingForTab(tabId);

  if (!startResponse.ok) {
    console.error(
      "Error arming tab capture from action click:",
      startResponse.error
    );
    return;
  }

  // The content script owns video detection and UI setup. Roll back capture
  // when the page has no video or the content script cannot be reached.
  try {
    const armResponse = await chrome.tabs.sendMessage(tabId, {
      type: "CAPTURE_ARMED",
    });

    const noVideo =
      armResponse &&
      armResponse.ok === false &&
      armResponse.error === "No video on page";

    if (noVideo) {
      // Avoid retaining offscreen and WebSocket resources without a video.
      await RecordingController.endRecording();
    }
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Could not notify the content script";

    console.warn(
      "Tab capture was armed, but the content script could not be notified:",
      message
    );

    // Prevent an armed capture session from remaining unusable in the background.
    await RecordingController.endRecording();
  }
});

/**
 * Returns the active transcript for the requesting tab, or null when the tab
 * does not own the current session.
 */
async function getTranscriptForTab(
  requesterTabId: number | undefined
): Promise<string | null> {
  const activeTabId = TranscriptStore.getActiveTabId();

  if (requesterTabId === undefined || requesterTabId !== activeTabId) {
    return null;
  }

  return await TranscriptStore.getFullTranscript();
}

// Routes messages received from content scripts.
chrome.runtime.onMessage.addListener(
  (
    msg: ExtensionMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (
      response:
        | RecordingResponse
        | SummaryResponse
        | AskLectureResponse
        | ChatHistoryResponse
        | QuizTopicsResponse
        | QuizQuestionResponse
        | InternalCaptureResponse
    ) => void
  ) => {
    if (msg.target === "offscreen") {
      return;
    }

    (async () => {
      // Restore the UI after navigation when this tab still owns the session.
      if (msg && msg.type === "IS_TAB_ACTIVE") {
        const tabId = sender.tab?.id;

        if (tabId === undefined) {
          return { ok: true, active: false };
        }

        const active = await RecordingController.isActiveRecordingTab(tabId);

        return { ok: true, active };
      }

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
            error: "No valid question was received.",
          };
        }

        let fullTranscript = "";

        if (requesterTabId !== undefined && requesterTabId === activeTabId) {
          fullTranscript = await TranscriptStore.getFullTranscript();
        } else {
          console.warn(
            "ASK_LECTURE was sent without an active transcript session for this tab."
          );
        }

        return await AskLectureClient.askLecture(question, fullTranscript);
      }

      // Persist completed exchanges only for the tab that owns the session.
      if (msg && msg.type === "SAVE_CHAT_MESSAGE") {
        const requesterTabId = sender.tab?.id;
        const activeTabId = TranscriptStore.getActiveTabId();

        const question = msg.question?.trim();
        const answer = msg.answer?.trim();

        if (
          requesterTabId === undefined ||
          requesterTabId !== activeTabId
        ) {
          return { ok: false, error: "No active session for this tab" };
        }

        if (!question || !answer) {
          return { ok: false, error: "Incomplete chat exchange" };
        }

        await TranscriptStore.appendChatExchange(question, answer);

        return { ok: true };
      }

      // Expose history only to the tab associated with the active session.
      if (msg && msg.type === "GET_CHAT_HISTORY") {
        const requesterTabId = sender.tab?.id;
        const activeTabId = TranscriptStore.getActiveTabId();

        if (
          requesterTabId === undefined ||
          requesterTabId !== activeTabId
        ) {
          return { ok: true, history: [] };
        }

        return { ok: true, history: TranscriptStore.getChatHistory() };
      }

      // Derive practice topics from the active lecture transcript.
      if (msg && msg.type === "QUIZ_TOPICS") {
        const transcript = await getTranscriptForTab(sender.tab?.id);

        if (transcript === null) {
          return { ok: false, error: "No active session for this tab" };
        }

        return await QuizClient.fetchTopics(transcript);
      }

      // Generate a single question for the selected topic.
      if (msg && msg.type === "QUIZ_QUESTION") {
        const transcript = await getTranscriptForTab(sender.tab?.id);

        if (transcript === null) {
          return { ok: false, error: "No active session for this tab" };
        }

        const topic = msg.topic?.trim();

        if (!topic) {
          return { ok: false, error: "No topic provided" };
        }

        return await QuizClient.fetchQuestion(transcript, topic);
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

        const fullTranscript = await TranscriptStore.getFullTranscript();

        if (!fullTranscript) {
          return {
            ok: false,
            error:
              "No transcript is available for summarization. Please start recording first.",
          };
        }

        return await SummaryClient.generateSummaryHtml(fullTranscript);
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