"use strict";
const SERVER_STREAM_URL = "http://localhost:3000/stream";
const TARGET_SAMPLE_RATE = 16000;
const BUFFER_DURATION_SECONDS = 5;
let capturedStream = null;
let audioContext = null;
let sourceNode = null;
let processorNode = null;
let playbackGainNode = null;
let silentGainNode = null;
let bufferedChunks = [];
let bufferedSamples = 0;
let isCapturing = false;
let uploadQueue = Promise.resolve();
function resetBufferedAudio() {
    bufferedChunks = [];
    bufferedSamples = 0;
}
function takeBufferedAudio() {
    if (bufferedSamples === 0) {
        return null;
    }
    const packet = {
        chunks: bufferedChunks,
        totalSamples: bufferedSamples,
    };
    resetBufferedAudio();
    return packet;
}
function floatTo16BitPCM(view, offset, input) {
    let currentOffset = offset;
    for (let i = 0; i < input.length; i++) {
        const sample = Math.max(-1, Math.min(1, input[i]));
        view.setInt16(currentOffset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
        currentOffset += 2;
    }
    return currentOffset;
}
function writeWavHeader(view, totalSamples, sampleRate) {
    const bytesPerSample = 2;
    const channels = 1;
    const dataLength = totalSamples * bytesPerSample;
    const blockAlign = channels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    view.setUint32(0, 0x52494646, false); // "RIFF"
    view.setUint32(4, 36 + dataLength, true);
    view.setUint32(8, 0x57415645, false); // "WAVE"
    view.setUint32(12, 0x666d7420, false); // "fmt "
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, channels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, 16, true); // bits per sample
    view.setUint32(36, 0x64617461, false); // "data"
    view.setUint32(40, dataLength, true);
}
function buildWavBuffer(packet, sampleRate) {
    const bytesPerSample = 2;
    const totalLength = 44 + packet.totalSamples * bytesPerSample;
    const buffer = new ArrayBuffer(totalLength);
    const view = new DataView(buffer);
    writeWavHeader(view, packet.totalSamples, sampleRate);
    let offset = 44;
    for (const chunk of packet.chunks) {
        offset = floatTo16BitPCM(view, offset, chunk);
    }
    return buffer;
}
async function uploadAudioPacket(packet) {
    const currentSampleRate = audioContext?.sampleRate ?? TARGET_SAMPLE_RATE;
    const wavBuffer = buildWavBuffer(packet, currentSampleRate);
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
function queueUpload(packet) {
    uploadQueue = uploadQueue
        .then(() => uploadAudioPacket(packet))
        .catch((error) => {
        console.error("Offscreen upload error:", error);
    });
}
async function flushBufferedAudio() {
    const packet = takeBufferedAudio();
    if (!packet) {
        return;
    }
    queueUpload(packet);
    await uploadQueue;
}
function disconnectAudioGraph() {
    try {
        sourceNode?.disconnect();
    }
    catch { }
    try {
        processorNode?.disconnect();
    }
    catch { }
    try {
        playbackGainNode?.disconnect();
    }
    catch { }
    try {
        silentGainNode?.disconnect();
    }
    catch { }
    sourceNode = null;
    processorNode = null;
    playbackGainNode = null;
    silentGainNode = null;
}
async function stopTabCapture() {
    if (!isCapturing && !capturedStream && !audioContext) {
        return;
    }
    isCapturing = false;
    if (processorNode) {
        processorNode.onaudioprocess = null;
    }
    await flushBufferedAudio();
    disconnectAudioGraph();
    if (capturedStream) {
        capturedStream.getTracks().forEach((track) => track.stop());
        capturedStream = null;
    }
    if (audioContext) {
        await audioContext.close();
        audioContext = null;
    }
    resetBufferedAudio();
}
async function startTabCapture(streamId) {
    await stopTabCapture();
    const constraints = {
        audio: {
            mandatory: {
                chromeMediaSource: "tab",
                chromeMediaSourceId: streamId,
            },
        },
        video: false,
    };
    capturedStream = await navigator.mediaDevices.getUserMedia(constraints);
    // Re-route captured audio back to the speakers so the user keeps hearing the tab.
    audioContext = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE });
    await audioContext.resume();
    sourceNode = audioContext.createMediaStreamSource(capturedStream);
    playbackGainNode = audioContext.createGain();
    playbackGainNode.gain.value = 1;
    sourceNode.connect(playbackGainNode);
    playbackGainNode.connect(audioContext.destination);
    processorNode = audioContext.createScriptProcessor(4096, 1, 1);
    silentGainNode = audioContext.createGain();
    silentGainNode.gain.value = 0;
    sourceNode.connect(processorNode);
    processorNode.connect(silentGainNode);
    silentGainNode.connect(audioContext.destination);
    const samplesPerPacket = TARGET_SAMPLE_RATE * BUFFER_DURATION_SECONDS;
    processorNode.onaudioprocess = (event) => {
        if (!isCapturing) {
            return;
        }
        const input = event.inputBuffer.getChannelData(0);
        bufferedChunks.push(new Float32Array(input));
        bufferedSamples += input.length;
        const output = event.outputBuffer.getChannelData(0);
        output.fill(0);
        if (bufferedSamples >= samplesPerPacket) {
            const packet = takeBufferedAudio();
            if (packet) {
                queueUpload(packet);
            }
        }
    };
    // Start in paused mode.
    // Actual recording starts only after the video play event.
    isCapturing = false;
}
async function pauseTabCapture() {
    if (!isCapturing) {
        return;
    }
    isCapturing = false;
    await flushBufferedAudio();
}
async function resumeTabCapture() {
    if (!capturedStream || !audioContext || !processorNode) {
        throw new Error("Tab capture is not active");
    }
    await audioContext.resume();
    isCapturing = true;
}
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.target !== "offscreen") {
        return;
    }
    (async () => {
        if (message.type === "START_TAB_CAPTURE_INTERNAL") {
            if (!message.streamId) {
                return { ok: false, error: "Missing streamId" };
            }
            await startTabCapture(message.streamId);
            return { ok: true };
        }
        if (message.type === "PAUSE_TAB_CAPTURE_INTERNAL") {
            await pauseTabCapture();
            return { ok: true };
        }
        if (message.type === "RESUME_TAB_CAPTURE_INTERNAL") {
            await resumeTabCapture();
            return { ok: true };
        }
        if (message.type === "STOP_TAB_CAPTURE_INTERNAL") {
            await stopTabCapture();
            return { ok: true };
        }
        return { ok: false, error: "Unknown offscreen message type" };
    })()
        .then(sendResponse)
        .catch((error) => {
        const message = error instanceof Error ? error.message : "Unexpected offscreen error";
        sendResponse({ ok: false, error: message });
    });
    return true;
});
