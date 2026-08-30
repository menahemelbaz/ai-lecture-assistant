import { TranscriptStore } from "./transcriptStore.js";
import { CaptureStore } from "./captureStore.js";
import { TabCaptureController } from "./tabCaptureController.js";

// Serializes recording state changes so pause, resume, and stop cannot overlap.
let recordingOperationQueue: Promise<void> = Promise.resolve();

function runRecordingOperation<T>(
  operation: () => Promise<T>
): Promise<T> {
  const result = recordingOperationQueue.then(operation, operation);

  recordingOperationQueue = result.then(
    () => undefined,
    () => undefined
  );

  return result;
}

// Checks the persisted capture state so the result survives worker restarts.
async function isActiveRecordingTab(tabId: number): Promise<boolean> {
  const capture = await CaptureStore.getCaptureState();

  return capture !== null && capture.tabId === tabId;
}

// Reconciles the persisted capture state with the offscreen document on startup.
async function restoreCaptureState(): Promise<void> {
  const capture = await CaptureStore.getCaptureState();

  if (!capture) {
    return;
  }

  const offscreenAlive =
    await TabCaptureController.hasOffscreenDocument();

  // Remove stale state when the offscreen capture document no longer exists.
  if (!offscreenAlive) {
    await CaptureStore.clearCaptureState();
    return;
  }

  // The offscreen document survives the worker restart and keeps sending
  // TRANSCRIPT_CHUNK messages, which the background listener handles. No
  // transcript connection needs to be re-established here.
}

// Arms tab capture while leaving audio recording paused until video playback.
async function beginRecordingForTab(
  tabId: number
): Promise<RecordingResponse> {
  const existingCapture = await CaptureStore.getCaptureState();

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

  try {
    await TabCaptureController.startTabCapturePath(tabId);

    await CaptureStore.setCaptureState({
      mode: "tab",
      status: "armed",
      tabId,
      updatedAt: Date.now(),
    });

    console.log("Tab capture armed and waiting for video play");

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

// Resumes audio capture for the armed tab and manages lecture-session changes.
function resumeRecordingForTab(
  tabId: number,
  lectureContext: LectureContext,
  confirmNewSession = false
): Promise<RecordingResponse> {
  return runRecordingOperation(async () => {
    const capture = await CaptureStore.getCaptureState();

    // Guard against recording requests from tabs where the extension is inactive.
    if (capture === null || capture.tabId !== tabId) {
      return {
        ok: false,
        error: "Extension is not active on this tab",
      };
    }

    const currentSession = TranscriptStore.getCurrentSession();

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
      if (TranscriptStore.hasTranscript() && !confirmNewSession) {
        return {
          ok: false,
          requiresSessionConfirmation: true,
          error:
            "Starting a new session will clear the current transcript",
        };
      }

      // Switching sessions: reset the transcript for the new lecture. Chunks
      // from the previous session are rejected by appendTranscript's session
      // id guard, so no socket teardown is needed.
      await TranscriptStore.startNewTranscriptSession(
        tabId,
        lectureContext
      );
    }

    if (capture.status === "recording") {
      return {
        ok: true,
        info: "Tab capture already recording",
      };
    }

    try {
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

// Pauses the active capture after all earlier recording operations complete.
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

// Stops capture and clears both the persisted state and lecture session.
function endRecording(): Promise<RecordingResponse> {
  return runRecordingOperation(async () => {
    const capture = await CaptureStore.getCaptureState();

    if (capture === null) {
      // Clear any transcript session left behind without an active capture.
      await TranscriptStore.clearSession();

      return {
        ok: true,
        info: "No active recording to stop",
      };
    }

    try {
      await TabCaptureController.stopTabCapturePath();

      await CaptureStore.clearCaptureState();
      await TranscriptStore.clearSession();

      return {
        ok: true,
        info: "Tab capture stopped",
      };
    } catch (error) {
      // Clear local state even when stopping fails to avoid a stale recording state.
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