import { TranscriptStore } from "./background/transcriptStore.js";
import { connectWebSocket } from "./background/websocketClient.js";
import { TabCaptureController } from "./background/tabCaptureController.js";

// Track the currently active capture mode
let captureMode: "tab" | null = null;

// Track whether the current tab capture is paused
let isCapturePaused = false;

/**
 * Start a PDF download from a regular HTTP URL.
 */
async function downloadPdfFromUrl(
  downloadUrl: string,
  filename: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.downloads.download(
      {
        url: downloadUrl,
        filename,
        saveAs: true,
      },
      (downloadId) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        if (downloadId === undefined) {
          reject(new Error("Failed to start PDF download"));
          return;
        }

        resolve();
      }
    );
  });
}

/**
 * Connect to the transcription WebSocket and store incoming transcript chunks.
 */
function connectTranscriptWebSocket(): void {
  connectWebSocket(async (text) => {
    await TranscriptStore.appendTranscript(text);
  });
}

async function beginRecordingForTab(tabId: number): Promise<RecordingResponse> {
  const activeTabId = TranscriptStore.getActiveTabId();

  if (captureMode !== null) {
    if (activeTabId === tabId && captureMode === "tab") {
      return {
        ok: true,
        info: "Tab capture is already armed",
      };
    }

    return { ok: false, error: "Recording already active on another tab" };
  }

  const shouldStartNewTranscriptSession = activeTabId !== tabId;

  connectTranscriptWebSocket();

  try {
    await TabCaptureController.startTabCapturePath(tabId);

    captureMode = "tab";
    isCapturePaused = true;

    if (shouldStartNewTranscriptSession) {
      await TranscriptStore.startNewTranscriptSession(tabId);
    } else {
      await TranscriptStore.setActiveTab(tabId);
    }

    console.log("Tab capture armed and waiting for video play");

    return {
      ok: true,
      info: "Tab capture armed. Recording will start when the video plays.",
    };
  } catch (error) {
    captureMode = null;
    isCapturePaused = false;

    const message =
      error instanceof Error ? error.message : "Failed to start tab capture";

    console.error("tabCapture path failed:", message);

    return {
      ok: false,
      error: `Tab capture failed: ${message}`,
    };
  }
}

async function resumeRecordingForTab(
  tabId: number
): Promise<RecordingResponse> {
  const activeTabId = TranscriptStore.getActiveTabId();

  if (activeTabId !== tabId || captureMode !== "tab") {
    return {
      ok: false,
      error: "Click the extension icon on this tab before playing the video",
    };
  }

  if (!isCapturePaused) {
    return { ok: true, info: "Tab capture already recording" };
  }

  try {
    connectTranscriptWebSocket();
    await TabCaptureController.resumeTabCapturePath();
    isCapturePaused = false;

    return { ok: true, info: "Tab capture recording started" };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to resume tab capture";

    return { ok: false, error: message };
  }
}

async function pauseRecording(): Promise<RecordingResponse> {
  if (captureMode !== "tab") {
    return { ok: true, info: "No active recording to pause" };
  }

  if (isCapturePaused) {
    return { ok: true, info: "Tab capture already paused" };
  }

  try {
    await TabCaptureController.pauseTabCapturePath();
    isCapturePaused = true;

    return { ok: true, info: "Tab capture paused" };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to pause tab capture";

    return { ok: false, error: message };
  }
}

async function endRecording(): Promise<RecordingResponse> {
  if (captureMode === "tab") {
    try {
      await TabCaptureController.stopTabCapturePath();
      captureMode = null;
      isCapturePaused = false;

      return { ok: true, info: "Tab capture stopped" };
    } catch (error) {
      captureMode = null;
      isCapturePaused = false;

      const message =
        error instanceof Error ? error.message : "Failed to stop tab capture";

      return { ok: false, error: message };
    }
  }

  return { ok: true, info: "No active recording to stop" };
}

// Restore transcript state when the service worker starts
TranscriptStore.loadTranscriptState().catch((err) => {
  console.error("Failed to initialize transcript state:", err);
});

// Start/stop from the extension icon.
// The first click arms tabCapture but does not record yet.
// A second click stops tabCapture and closes the offscreen document.
chrome.action.onClicked.addListener(async (tab) => {
  const tabId = tab.id;

  if (tabId === undefined) {
    console.error("Could not identify the clicked tab");
    return;
  }

  const activeTabId = TranscriptStore.getActiveTabId();

  if (captureMode !== null && activeTabId === tabId) {
    const stopResponse = await endRecording();

    if (!stopResponse.ok) {
      console.error(
        "Error stopping recording from action click:",
        stopResponse.error
      );
    }

    return;
  }

  const startResponse = await beginRecordingForTab(tabId);

  if (!startResponse.ok) {
    console.error(
      "Error arming tab capture from action click:",
      startResponse.error
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
          return { ok: false, error: "Could not identify the active tab" };
        }

        return await resumeRecordingForTab(tabId);
      }

      if (msg && msg.type === "STOP_RECORDING") {
        return await pauseRecording();
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

        if (requesterTabId !== undefined && requesterTabId === activeTabId) {
          fullTranscript = await TranscriptStore.getFullTranscript();
        } else {
          console.warn(
            "ASK_LECTURE was sent without an active transcript session for this tab."
          );
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);

        try {
          const response = await fetch("http://localhost:3000/ask", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              question,
              transcript: fullTranscript,
            }),
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          if (!response.ok) {
            throw new Error(
              `Server returned ${response.status}: ${response.statusText}`
            );
          }

          const data: {
            success: boolean;
            answer?: string;
            error?: string;
          } = await response.json();

          if (!data.success) {
            return {
              ok: false,
              error: data.error || "שגיאה בקבלת תשובה מהשרת.",
            };
          }

          return {
            ok: true,
            answer: data.answer || "לא התקבלה תשובה מהשרת.",
          };
        } catch (err) {
          clearTimeout(timeoutId);

          const error = err as Error;
          console.error("Error asking lecture question:", error);

          if (error.name === "TypeError" && error.message.includes("fetch")) {
            return {
              ok: false,
              error: "השרת לא פועל. אנא הפעל את השרת תחילה.",
            };
          }

          if (error.name === "AbortError") {
            return {
              ok: false,
              error: "הבקשה ארכה זמן רב מדי. נסה שוב.",
            };
          }

          return {
            ok: false,
            error: error.message || "שגיאה בקבלת תשובה מהשרת.",
          };
        }
      }

      if (msg && msg.type === "GENERATE_SUMMARY") {
        const requesterTabId = sender.tab?.id;
        const activeTabId = TranscriptStore.getActiveTabId();

        if (requesterTabId === undefined || requesterTabId !== activeTabId) {
          return {
            ok: false,
            error: "No active transcript session for this tab",
          };
        }

        const fullTranscript = await TranscriptStore.getFullTranscript();

        if (!fullTranscript) {
          return {
            ok: false,
            error: "אין תמלול זמין לסיכום, אנא הפעל הקלטה תחילה",
          };
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);

        try {
          const response = await fetch("http://localhost:3000/summarize", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: fullTranscript }),
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          if (!response.ok) {
            throw new Error(
              `Server returned ${response.status}: ${response.statusText}`
            );
          }

          const data: {
            success: boolean;
            summary?: string;
            downloadUrl?: string;
            filename?: string;
            error?: string;
          } = await response.json();

          if (data.success && data.downloadUrl) {
            await downloadPdfFromUrl(
              data.downloadUrl,
              data.filename || "סיכום הרצאה.pdf"
            );

            return {
              ok: true,
              info: "PDF download started",
            };
          }

          throw new Error(data.error || "Failed to generate summary");
        } catch (err) {
          clearTimeout(timeoutId);

          const error = err as Error;
          console.error("Error generating summary:", error);

          if (error.name === "TypeError" && error.message.includes("fetch")) {
            return {
              ok: false,
              error: "השרת לא פועל. אנא הפעל את השרת תחילה.",
            };
          } else if (error.name === "AbortError") {
            return {
              ok: false,
              error: "הבקשה ארכה זמן רב מדי. נסה שוב.",
            };
          } else {
            return {
              ok: false,
              error: error.message || "שגיאה ביצירת הסיכום",
            };
          }
        }
      }

      return { ok: false, error: "Unknown message type" };
    })()
      .then(sendResponse)
      .catch((err: unknown) => {
        const errorMessage =
          err instanceof Error ? err.message : "Unexpected background error";

        sendResponse({ ok: false, error: errorMessage });
      });

    return true;
  }
);
