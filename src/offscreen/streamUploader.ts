import {
    buildWavBuffer,
    type BufferedAudioPacket,
} from "./wavEncoder.js";

const SERVER_STREAM_URL = "http://localhost:3000/stream";

let uploadQueue: Promise<void> = Promise.resolve();

/**
 * Upload one audio packet to the local transcription server.
 */
async function uploadAudioPacket(
    packet: BufferedAudioPacket,
    sampleRate: number
): Promise<void> {
    const wavBuffer = buildWavBuffer(packet, sampleRate);

    const response = await fetch(SERVER_STREAM_URL, {
        method: "POST",
        headers: {
            "Content-Type": "audio/wav",
        },
        body: wavBuffer,
    });

    if (!response.ok) {
        throw new Error(
            `Server returned ${response.status}: ${response.statusText}`
        );
    }
}

/**
 * Queue audio uploads so chunks are sent one after another.
 */
function queueUpload(packet: BufferedAudioPacket, sampleRate: number): void {
    uploadQueue = uploadQueue
        .then(() => uploadAudioPacket(packet, sampleRate))
        .catch((error: unknown) => {
            console.error("Offscreen upload error:", error);
        });
}

/**
 * Wait until all queued uploads finish.
 */
async function waitForPendingUploads(): Promise<void> {
    await uploadQueue;
}

export const StreamUploader = {
    queueUpload,
    waitForPendingUploads,
};
