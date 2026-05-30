import { buildWavBuffer, } from "./wavEncoder.js";
const SERVER_STREAM_URL = "http://localhost:3000/stream";
let uploadQueue = Promise.resolve();
/**
 * Upload one audio packet to the local transcription server.
 */
async function uploadAudioPacket(packet, sampleRate) {
    const wavBuffer = buildWavBuffer(packet, sampleRate);
    const response = await fetch(SERVER_STREAM_URL, {
        method: "POST",
        headers: {
            "Content-Type": "audio/wav",
        },
        body: wavBuffer,
    });
    if (!response.ok) {
        throw new Error(`Server returned ${response.status}: ${response.statusText}`);
    }
}
/**
 * Queue audio uploads so chunks are sent one after another.
 */
function queueUpload(packet, sampleRate) {
    uploadQueue = uploadQueue
        .then(() => uploadAudioPacket(packet, sampleRate))
        .catch((error) => {
        console.error("Offscreen upload error:", error);
    });
}
/**
 * Wait until all queued uploads finish.
 */
async function waitForPendingUploads() {
    await uploadQueue;
}
export const StreamUploader = {
    queueUpload,
    waitForPendingUploads,
};
