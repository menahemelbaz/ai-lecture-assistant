import { buildWavBuffer, } from "./wavEncoder.js";
import { OpenAiClient } from "../config/openaiClient.js";
const WHISPER_MODEL = "whisper-1";
const TRANSCRIPTION_LANGUAGE = "he";
// Serializes transcription so the packets stay in their original order. Each
// packet waits for the previous one, so Whisper calls never overlap and the
// resulting text reaches the background in capture order.
let uploadQueue = Promise.resolve();
// Transcribes one buffered audio packet directly with OpenAI Whisper and sends
// the resulting text to the background service worker.
async function transcribePacket(packet, sampleRate) {
    const wavBuffer = buildWavBuffer(packet, sampleRate);
    const audioBlob = new Blob([wavBuffer], { type: "audio/wav" });
    const result = await OpenAiClient.transcribeAudio(audioBlob, {
        model: WHISPER_MODEL,
        language: TRANSCRIPTION_LANGUAGE,
    });
    if (!result.ok) {
        // Step 4b will forward result.errorKind to the user. For now, surface it
        // in the console without breaking the capture loop.
        console.error(`Transcription failed (${result.errorKind}): ${result.error}`);
        return;
    }
    const text = result.data.trim();
    if (!text) {
        return;
    }
    // Send the transcript chunk to the background, which attaches the active
    // session id and appends it to the transcript store.
    chrome.runtime.sendMessage({
        type: "TRANSCRIPT_CHUNK",
        text,
    }, () => {
        // Read lastError to avoid an unchecked runtime warning if the
        // background is momentarily asleep.
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
