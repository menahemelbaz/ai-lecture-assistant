import { buildWavBuffer, } from "./wavEncoder.js";
const SERVER_STREAM_URL = "http://localhost:3000/stream";
// Serializes uploads to preserve the original order of the audio packets.
let uploadQueue = Promise.resolve();
// Converts and uploads a buffered audio packet to the transcription server.
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
// Queues audio packets so they are uploaded sequentially and remain ordered.
function queueUpload(packet, sampleRate) {
    uploadQueue = uploadQueue
        .then(() => uploadAudioPacket(packet, sampleRate))
        .catch((error) => {
        console.error("Offscreen upload error:", error);
    });
}
// Waits for all currently queued uploads to complete.
async function waitForPendingUploads() {
    await uploadQueue;
}
export const StreamUploader = {
    queueUpload,
    waitForPendingUploads,
};
