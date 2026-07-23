import { StreamUploader } from "./streamUploader.js";
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
function resetBufferedAudio() {
    bufferedChunks = [];
    bufferedSamples = 0;
}
// Detach the current buffer before upload so new samples can accumulate separately.
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
function getCurrentSampleRate() {
    return audioContext?.sampleRate ?? TARGET_SAMPLE_RATE;
}
function queueBufferedAudioUpload(packet) {
    StreamUploader.queueUpload(packet, getCurrentSampleRate());
}
// Upload any remaining partial packet before a capture state transition completes.
async function flushBufferedAudio() {
    const packet = takeBufferedAudio();
    if (!packet) {
        return;
    }
    queueBufferedAudioUpload(packet);
    await StreamUploader.waitForPendingUploads();
}
// Disconnect each node independently because the graph may be partially initialized.
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
    // Route the captured audio back to the output so the tab remains audible.
    audioContext = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE });
    await audioContext.resume();
    sourceNode = audioContext.createMediaStreamSource(capturedStream);
    playbackGainNode = audioContext.createGain();
    playbackGainNode.gain.value = 1;
    sourceNode.connect(playbackGainNode);
    playbackGainNode.connect(audioContext.destination);
    // Keep the processor connected through a silent output node so audio events continue.
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
        // Silence the processor's output because playback uses a separate gain path.
        const output = event.outputBuffer.getChannelData(0);
        output.fill(0);
        if (bufferedSamples >= samplesPerPacket) {
            const packet = takeBufferedAudio();
            if (packet) {
                queueBufferedAudioUpload(packet);
            }
        }
    };
    // Remain paused until the content script reports that video playback has started.
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
async function stopTabCapture() {
    if (!isCapturing && !capturedStream && !audioContext) {
        return;
    }
    isCapturing = false;
    // Stop receiving new samples before flushing and releasing capture resources.
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
export const AudioCaptureController = {
    startTabCapture,
    pauseTabCapture,
    resumeTabCapture,
    stopTabCapture,
};
