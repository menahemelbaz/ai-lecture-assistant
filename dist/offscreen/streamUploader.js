import { buildWavBuffer, } from "./wavEncoder.js";
import { OpenAiClient } from "../config/openaiClient.js";
const WHISPER_MODEL = "whisper-1";
// Serializes transcription so the packets stay in their original order.
let uploadQueue = Promise.resolve();
// Notifies the background of a transcription failure so it can inform the user.
function reportTranscriptionError(errorKind) {
    chrome.runtime.sendMessage({
        type: "TRANSCRIPTION_ERROR",
        errorKind,
    }, () => {
        void chrome.runtime.lastError;
    });
}
// Transcribes one buffered audio packet directly with OpenAI Whisper and sends
// the resulting text to the background service worker.
async function transcribePacket(packet, sampleRate) {
    const wavBuffer = buildWavBuffer(packet, sampleRate);
    const audioBlob = new Blob([wavBuffer], { type: "audio/wav" });
    const result = await OpenAiClient.transcribeAudio(audioBlob, {
        model: WHISPER_MODEL,
    });
    if (!result.ok) {
        console.error(`Transcription failed (${result.errorKind}): ${result.error}`);
        reportTranscriptionError(result.errorKind);
        return;
    }
    const text = result.data.trim();
    if (!text) {
        return;
    }
    // Send the transcript chunk to the background, which attaches the active
    // session id and appends it to the transcript store. A successful chunk
    // also implicitly signals recovery, letting the background re-arm errors.
    chrome.runtime.sendMessage({
        type: "TRANSCRIPT_CHUNK",
        text,
    }, () => {
        void chrome.runtime.lastError;
    });
}
// Queues audio packets so they are transcribed sequentially and remain ordered.
function queueUpload(packet, sampleRate) {
    uploadQueue = uploadQueue
        .then(() => transcribePacket(packet, sampleRate))
        .catch((error) => {
        console.error("Offscreen transcription error:", error);
    });
}
// Waits for all currently queued transcriptions to complete.
async function waitForPendingUploads() {
    await uploadQueue;
}
export const StreamUploader = {
    queueUpload,
    waitForPendingUploads,
};
