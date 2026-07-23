import { TranscriptStore } from "./background/transcriptStore.js";
import { SummaryClient } from "./background/summaryClient.js";
import { AskLectureClient } from "./background/askLectureClient.js";
import { QuizClient } from "./background/quizClient.js";
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

  // Second click on an active tab: turn the extension off. Stop recording and
  // tell the content script to remove its buttons UI.
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

  // First click: arm capture, then ask the content script to show its UI.
  const startResponse =
    await RecordingController.beginRecordingForTab(tabId);

  if (!startResponse.ok) {
    console.error(
      "Error arming tab capture from action click:",
      startResponse.error
    );
    return;
  }

  // Notify the content script that capture is armed. The content script decides
  // whether a video is present: if it is, it shows the buttons (and starts
  // recording if the video is already playing). If not, it reports back so we
  // can undo the arming we just did, rather than leaving an idle offscreen
  // document and open socket behind.
  try {
    const armResponse = await chrome.tabs.sendMessage(tabId, {
      type: "CAPTURE_ARMED",
    });

    const noVideo =
      armResponse &&
      armResponse.ok === false &&
      armResponse.error === "No video on page";

    if (noVideo) {
      // No video to record: roll back the arming so we don't leave resources
      // (offscreen document, WebSocket) open for nothing.
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

    // The content script isn't reachable (e.g. no content script on this page).
    // Roll back so we don't leak an armed-but-unusable capture.
    await RecordingController.endRecording();
  }
});

/**
 * Resolve the active transcript for a requesting tab, or null if this tab is
 * not the active session tab.
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
      // A content script that just loaded (e.g. after a tab refresh) asks
      // whether this tab is still active, so it can restore its buttons UI
      // without waiting for another icon click.
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

      // Save a completed question/answer exchange for this tab's session.
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

      // Return the saved chat history for this tab's session.
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

      // Map the lecture transcript into practice topics.
      if (msg && msg.type === "QUIZ_TOPICS") {
        const transcript = await getTranscriptForTab(sender.tab?.id);

        if (transcript === null) {
          return { ok: false, error: "No active session for this tab" };
        }

        return await QuizClient.fetchTopics(transcript);
      }

      // Generate one quiz question about a chosen topic.
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
