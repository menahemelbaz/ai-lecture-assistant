// Initialize the WebSocket variable
let socket: WebSocket | null = null;

// Initialize the Python process
let pythonProcess: number | null = null;

// Track whether a connection attempt is in progress
let connecting: boolean = false;

// Store the active transcript in the background script
let transcriptChunks: string[] = [];

// Track which tab started the current recording session
let activeTabId: number | null = null;

// Track the currently active capture mode
let captureMode: "tab" | "python" | null = null;

// Storage keys
const TRANSCRIPT_STORAGE_KEY = "transcriptChunks";
const ACTIVE_TAB_STORAGE_KEY = "activeTranscriptTabId";

/**
 * Load the saved transcript state from local storage.
 */
async function loadTranscriptState(): Promise<void> {
  try {
    const result = await chrome.storage.local.get([
      TRANSCRIPT_STORAGE_KEY,
      ACTIVE_TAB_STORAGE_KEY,
    ]);

    const storedChunks = result[TRANSCRIPT_STORAGE_KEY];
    const storedTabId = result[ACTIVE_TAB_STORAGE_KEY];

    if (Array.isArray(storedChunks)) {
      transcriptChunks = storedChunks.filter(
        (item: unknown): item is string => typeof item === "string"
      );
    } else {
      transcriptChunks = [];
    }

    activeTabId = typeof storedTabId === "number" ? storedTabId : null;
  } catch (err) {
    console.error("Error loading transcript state:", err);
    transcriptChunks = [];
    activeTabId = null;
  }
}

/**
 * Save the current transcript state to local storage.
 */
async function saveTranscriptState(): Promise<void> {
  try {
    await chrome.storage.local.set({
      [TRANSCRIPT_STORAGE_KEY]: transcriptChunks,
      [ACTIVE_TAB_STORAGE_KEY]: activeTabId,
    });
  } catch (err) {
    console.error("Error saving transcript state:", err);
  }
}

/**
 * Clear the current transcript from memory and local storage.
 */
async function clearTranscript(): Promise<void> {
  transcriptChunks = [];
  await saveTranscriptState();
}

/**
 * Set the current active tab and persist it.
 */
async function setActiveTab(tabId: number | null): Promise<void> {
  activeTabId = tabId;
  await saveTranscriptState();
}

/**
 * Add a new chunk of transcript to memory and persist it.
 */
async function appendTranscript(text: string): Promise<void> {
  const trimmedText = text.trim();

  if (!trimmedText) {
    return;
  }

  transcriptChunks.push(trimmedText);
  await saveTranscriptState();
}

/**
 * Return the full transcript as a single string.
 */
async function getFullTranscript(): Promise<string> {
  if (transcriptChunks.length === 0) {
    await loadTranscriptState();
  }

  return transcriptChunks.join(" ").trim();
}

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

async function ensureOffscreenDocument(): Promise<void> {
  const contexts = await chrome.runtime.getContexts({});

  const hasOffscreenDocument = contexts.some(
    (context) => context.contextType === "OFFSCREEN_DOCUMENT"
  );

  if (hasOffscreenDocument) {
    return;
  }

  await chrome.offscreen.createDocument({
    url: "offscreen.html",
    reasons: ["USER_MEDIA"],
    justification: "Capture tab audio for lecture transcription",
  });
}

async function closeOffscreenDocumentIfOpen(): Promise<void> {
  const contexts = await chrome.runtime.getContexts({});

  const hasOffscreenDocument = contexts.some(
    (context) => context.contextType === "OFFSCREEN_DOCUMENT"
  );

  if (!hasOffscreenDocument) {
    return;
  }

  await chrome.offscreen.closeDocument();
}

function sendRuntimeMessage<T>(message: ExtensionMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response: T) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      resolve(response);
    });
  });
}

async function startTabCapturePath(tabId: number): Promise<void> {
  await ensureOffscreenDocument();

  const streamId = await chrome.tabCapture.getMediaStreamId({
    targetTabId: tabId,
  });

  const response = await sendRuntimeMessage<InternalCaptureResponse>({
    type: "START_TAB_CAPTURE_INTERNAL",
    target: "offscreen",
    streamId,
  });

  if (!response.ok) {
    throw new Error(response.error || "Failed to start offscreen tab capture");
  }
}

async function stopTabCapturePath(): Promise<void> {
  const response = await sendRuntimeMessage<InternalCaptureResponse>({
    type: "STOP_TAB_CAPTURE_INTERNAL",
    target: "offscreen",
  });

  if (!response.ok) {
    throw new Error(response.error || "Failed to stop offscreen tab capture");
  }

  await closeOffscreenDocumentIfOpen();
}

async function startPythonCapturePath(): Promise<RecordingResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch("http://localhost:3000/start-recording", {
      method: "POST",
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(
        `Server returned ${response.status}: ${response.statusText}`
      );
    }

    const data: { pid: number; message: string } = await response.json();

    pythonProcess = data.pid;
    captureMode = "python";
    console.log(`Recording started with PID: ${pythonProcess}`);

    return { ok: true, info: data.message, pid: pythonProcess };
  } catch (err) {
    clearTimeout(timeoutId);

    const error = err as Error;

    if (error.name === "TypeError" && error.message.includes("fetch")) {
      return {
        ok: false,
        error: "Server is not running. Please start the server first.",
      };
    } else if (error.name === "AbortError") {
      return {
        ok: false,
        error: "Request timed out. Server may not be responding.",
      };
    } else {
      return {
        ok: false,
        error: error.message || "Failed to start recording",
      };
    }
  }
}

async function stopPythonCapturePath(): Promise<RecordingResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch("http://localhost:3000/stop-recording", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pid: pythonProcess }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    pythonProcess = null;
    captureMode = null;

    if (!response.ok) {
      throw new Error(
        `Server returned ${response.status}: ${response.statusText}`
      );
    }

    const data: { message: string } = await response.json();

    console.log("Recording stopped");
    return { ok: true, info: data.message };
  } catch (err) {
    clearTimeout(timeoutId);
    pythonProcess = null;
    captureMode = null;

    const error = err as Error;

    if (error.name === "TypeError" && error.message.includes("fetch")) {
      return {
        ok: true,
        info: "Recording process cleared (server may not be running)",
      };
    } else if (error.name === "AbortError") {
      return {
        ok: true,
        info: "Recording process cleared (request timed out)",
      };
    } else {
      return {
        ok: true,
        info: "Recording process cleared (server may have stopped it)",
      };
    }
  }
}

function connectWebSocket(): void {
  if (socket && socket.readyState === WebSocket.OPEN) return;
  if (connecting) return;

  connecting = true;

  try {
    socket = new WebSocket("ws://localhost:3001");

    socket.onopen = () => {
      console.log("WebSocket is connected");
      connecting = false;
    };

    socket.onmessage = async (message: MessageEvent) => {
      const text: string =
        typeof message.data === "string"
          ? message.data
          : String(message.data);

      try {
        await appendTranscript(text);
      } catch (err) {
        console.error("Error appending transcript chunk:", err);
      }
    };

    socket.onclose = () => {
      connecting = false;
      socket = null;
    };

    socket.onerror = (_err: Event) => {
      connecting = false;

      if (socket) {
        try {
          socket.close();
        } catch {}

        socket = null;
      }
    };
  } catch {
    connecting = false;
    socket = null;
  }
}

async function beginRecordingForTab(tabId: number): Promise<RecordingResponse> {
  if (captureMode !== null) {
    return { ok: false, error: "Recording already active" };
  }

  await setActiveTab(tabId);
  await clearTranscript();
  connectWebSocket();

  try {
    await startTabCapturePath(tabId);
    captureMode = "tab";
    console.log("Recording started with tabCapture");
    return { ok: true, info: "Tab capture started" };
  } catch (error) {
    console.warn(
      "tabCapture path failed. Falling back to Python capture.",
      error
    );
  }

  return await startPythonCapturePath();
}

async function endRecording(): Promise<RecordingResponse> {
  if (captureMode === "tab") {
    try {
      await stopTabCapturePath();
      captureMode = null;
      return { ok: true, info: "Tab capture stopped" };
    } catch (error) {
      captureMode = null;
      const message =
        error instanceof Error ? error.message : "Failed to stop tab capture";
      return { ok: false, error: message };
    }
  }

  if (captureMode === "python") {
    return await stopPythonCapturePath();
  }

  return { ok: true, info: "No active recording to stop" };
}

// Restore transcript state when the service worker starts
loadTranscriptState().catch((err) => {
  console.error("Failed to initialize transcript state:", err);
});

// Start/stop from the extension icon.
// This is the user invocation Chrome expects for tabCapture.
chrome.action.onClicked.addListener(async (tab) => {
  const tabId = tab.id;

  if (tabId === undefined) {
    console.error("Could not identify the clicked tab");
    return;
  }

  if (captureMode !== null && activeTabId === tabId) {
    const stopResponse = await endRecording();

    if (!stopResponse.ok) {
      console.error("Error stopping recording from action click:", stopResponse.error);
    }

    return;
  }

  const startResponse = await beginRecordingForTab(tabId);

  if (!startResponse.ok) {
    console.error("Error starting recording from action click:", startResponse.error);
  }
});

// Central message router invoked by the content scripts injected into tabs.
chrome.runtime.onMessage.addListener(
  (
    msg: ExtensionMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: RecordingResponse | SummaryResponse | InternalCaptureResponse) => void
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

        return await beginRecordingForTab(tabId);
      }

      if (msg && msg.type === "STOP_RECORDING") {
        return await endRecording();
      }

      if (msg && msg.type === "GENERATE_SUMMARY") {
        const requesterTabId = sender.tab?.id;

        if (requesterTabId === undefined || requesterTabId !== activeTabId) {
          return {
            ok: false,
            error: "No active transcript session for this tab",
          };
        }

        const fullTranscript = await getFullTranscript();

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

          if (
            error.name === "TypeError" &&
            error.message.includes("fetch")
          ) {
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