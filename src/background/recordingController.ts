import { TranscriptStore } from "./transcriptStore.js";
import { CaptureStore } from "./captureStore.js";
import { connectWebSocket, disconnectWebSocket } from "./websocketClient.js";
import { TabCaptureController } from "./tabCaptureController.js";

// Serialize recording state changes so pause, resume, and stop operations
// cannot run at the same time.
let recordingOperationQueue: Promise<void> = Promise.resolve();

function runRecordingOperation<T>(
  operation: () => Promise<T>
): Promise<T> {
  const result = recordingOperationQueue.then(
    operation,
    operation
  );

  recordingOperationQueue = result.then(
    () => undefined,
    () => undefined
  );

  return result;
}

/**
 * Connect to the transcription WebSocket and store incoming transcript chunks.
 * Each chunk is tagged with the session that was active when the socket opened,
 * so chunks that outlive a lecture switch are dropped instead of leaking into
 * the next lecture.
 */
function connectTranscriptWebSocket(): void {
  connectWebSocket(async (text) => {
    const sessionId = TranscriptStore.getCurrentSessionId() ?? undefined;
    await TranscriptStore.appendTranscript(text, sessionId);
  });
}

/**
 * Return whether an active capture belongs to the given tab.
 * Reads the persisted capture record, so it stays correct even after the
 * service worker has been restarted.
 */
async function isActiveRecordingTab(
  tabId: number
): Promise<boolean> {
  const capture = await CaptureStore.getCaptureState();

  return capture !== null && capture.tabId === tabId;
}

/**
 * Reconcile the persisted capture record with reality on worker startup.
 *
 * In Manifest V3 the service worker can be terminated at any time. When it
 * wakes, the persisted record is the source of truth - but the offscreen
 * document that performs the actual capture may or may not still be alive.
 * This aligns the two and re-opens the transcript socket when a recording is
 * genuinely still in progress.
 */
async function restoreCaptureState(): Promise<void> {
  const capture = await CaptureStore.getCaptureState();

  if (!capture) {
    return;
  }

  const offscreenAlive =
    await TabCaptureController.hasOffscreenDocument();

  // The offscreen document is gone, so no capture can be running.
  // Clear the stale record so the UI and controller agree again.
  if (!offscreenAlive) {
    await CaptureStore.clearCaptureState();
    return;
  }

  // A recording was in progress when the worker slept. Re-open the socket so
  // incoming transcript chunks are stored again.
  if (capture.status === "recording") {
    connectTranscriptWebSocket();
  }
}

/**
 * Arm tab capture for a specific tab.
 * Recording will start only when the video starts playing.
 */
async function beginRecordingForTab(
  tabId: number
): Promise<RecordingResponse> {
  const existingCapture =
    await CaptureStore.getCaptureState();

  if (existingCapture !== null) {
    if (existingCapture.tabId === tabId) {
      return {
        ok: true,
        info: "Tab capture is already armed",
      };
    }

    return {
      ok: false,
      error: "Recording already active on another tab",
    };
  }

  connectTranscriptWebSocket();

  try {
    await TabCaptureController.startTabCapturePath(tabId);

    await CaptureStore.setCaptureState({
      mode: "tab",
      status: "armed",
      tabId,
      updatedAt: Date.now(),
    });

    console.log(
      "Tab capture armed and waiting for video play"
    );

    return {
      ok: true,
      info:
        "Tab capture armed. Recording will start when the video plays.",
    };
  } catch (error) {
    await CaptureStore.clearCaptureState();

    const message =
      error instanceof Error
        ? error.message
        : "Failed to start tab capture";

    console.error("tabCapture path failed:", message);

    return {
      ok: false,
      error: `Tab capture failed: ${message}`,
    };
  }
}

/**
 * Resume audio recording for the armed tab.
 */
function resumeRecordingForTab(
  tabId: number,
  lectureContext: LectureContext,
  confirmNewSession = false
): Promise<RecordingResponse> {
  return runRecordingOperation(async () => {
    const capture = await CaptureStore.getCaptureState();

    // With the new activation flow this should not normally happen (no buttons
    // and no arming without an icon click), so this is just a safety guard.
    if (capture === null || capture.tabId !== tabId) {
      return {
        ok: false,
        error: "Extension is not active on this tab",
      };
    }

    const currentSession =
      TranscriptStore.getCurrentSession();

    const isCurrentLecture =
      currentSession !== null &&
      currentSession.tabId === tabId &&
      TranscriptStore.isSameLectureContext(
        currentSession.context,
        lectureContext
      );

    if (!currentSession) {
      await TranscriptStore.startNewTranscriptSession(
        tabId,
        lectureContext
      );
    } else if (!isCurrentLecture) {
      if (
        TranscriptStore.hasTranscript() &&
        !confirmNewSession
      ) {
        return {
          ok: false,
          requiresSessionConfirmation: true,
          error:
            "Starting a new session will clear the current transcript",
        };
      }

      // Switching lectures. Tear down the socket first so any in-flight chunk
      // from the previous lecture lands on a closed connection and is dropped,
      // then start the new session, then reconnect for the new lecture.
      disconnectWebSocket();

      await TranscriptStore.startNewTranscriptSession(
        tabId,
        lectureContext
      );

      connectTranscriptWebSocket();
    }

    if (capture.status === "recording") {
      return {
        ok: true,
        info: "Tab capture already recording",
      };
    }

    try {
      connectTranscriptWebSocket();

      await TabCaptureController.resumeTabCapturePath();

      await CaptureStore.updateCaptureStatus("recording");

      return {
        ok: true,
        info: "Tab capture recording started",
      };
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to resume tab capture";

      return {
        ok: false,
        error: message,
      };
    }
  });
}

/**
 * Pause the active tab capture session.
 */
function pauseRecording(): Promise<RecordingResponse> {
  return runRecordingOperation(async () => {
    const capture = await CaptureStore.getCaptureState();

    if (capture === null) {
      return {
        ok: true,
        info: "No active recording to pause",
      };
    }

    if (capture.status !== "recording") {
      return {
        ok: true,
        info: "Tab capture already paused",
      };
    }

    try {
      await TabCaptureController.pauseTabCapturePath();

      await CaptureStore.updateCaptureStatus("paused");

      return {
        ok: true,
        info: "Tab capture paused",
      };
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to pause tab capture";

      return {
        ok: false,
        error: message,
      };
    }
  });
}

/**
 * Stop the active tab capture session and clear the lecture session.
 *
 * This is the extension's "off switch": it stops capture, closes the socket,
 * clears the persisted capture record, AND clears the transcript session - so
 * a later activation starts clean and does not prompt about a stale lecture.
 */
function endRecording(): Promise<RecordingResponse> {
  return runRecordingOperation(async () => {
    const capture = await CaptureStore.getCaptureState();

    if (capture === null) {
      // Nothing capturing, but still make sure no stale session lingers.
      await TranscriptStore.clearSession();

      return {
        ok: true,
        info: "No active recording to stop",
      };
    }

    try {
      await TabCaptureController.stopTabCapturePath();

      disconnectWebSocket();
      await CaptureStore.clearCaptureState();
      await TranscriptStore.clearSession();

      return {
        ok: true,
        info: "Tab capture stopped",
      };
    } catch (error) {
      // Even if the stop path fails, drop the record and session so we never
      // get stuck in a permanent "recording" state that no longer reflects
      // reality.
      disconnectWebSocket();
      await CaptureStore.clearCaptureState();
      await TranscriptStore.clearSession();

      const message =
        error instanceof Error
          ? error.message
          : "Failed to stop tab capture";

      return {
        ok: false,
        error: message,
      };
    }
  });
}

export const RecordingController = {
  isActiveRecordingTab,
  restoreCaptureState,
  beginRecordingForTab,
  resumeRecordingForTab,
  pauseRecording,
  endRecording,
};
