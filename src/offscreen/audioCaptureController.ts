import { type BufferedAudioPacket } from "./wavEncoder.js";
import { StreamUploader } from "./streamUploader.js";

const TARGET_SAMPLE_RATE = 16000;
const BUFFER_DURATION_SECONDS = 5;

type ChromeTabAudioConstraints = MediaTrackConstraints & {
    mandatory: {
        chromeMediaSource: "tab";
        chromeMediaSourceId: string;
    };
};

let capturedStream: MediaStream | null = null;
let audioContext: AudioContext | null = null;
let sourceNode: MediaStreamAudioSourceNode | null = null;
let processorNode: ScriptProcessorNode | null = null;
let playbackGainNode: GainNode | null = null;
let silentGainNode: GainNode | null = null;

let bufferedChunks: Float32Array[] = [];
let bufferedSamples = 0;
let isCapturing = false;

function resetBufferedAudio(): void {
    bufferedChunks = [];
    bufferedSamples = 0;
}

function takeBufferedAudio(): BufferedAudioPacket | null {
    if (bufferedSamples === 0) {
        return null;
    }

    const packet: BufferedAudioPacket = {
        chunks: bufferedChunks,
        totalSamples: bufferedSamples,
    };

    resetBufferedAudio();
    return packet;
}

function getCurrentSampleRate(): number {
    return audioContext?.sampleRate ?? TARGET_SAMPLE_RATE;
}

function queueBufferedAudioUpload(packet: BufferedAudioPacket): void {
    StreamUploader.queueUpload(packet, getCurrentSampleRate());
}

async function flushBufferedAudio(): Promise<void> {
    const packet = takeBufferedAudio();

    if (!packet) {
        return;
    }

    queueBufferedAudioUpload(packet);
    await StreamUploader.waitForPendingUploads();
}

function disconnectAudioGraph(): void {
    try {
        sourceNode?.disconnect();
    } catch { }

    try {
        processorNode?.disconnect();
    } catch { }

    try {
        playbackGainNode?.disconnect();
    } catch { }

    try {
        silentGainNode?.disconnect();
    } catch { }

    sourceNode = null;
    processorNode = null;
    playbackGainNode = null;
    silentGainNode = null;
}

async function startTabCapture(streamId: string): Promise<void> {
    await stopTabCapture();

    const constraints: MediaStreamConstraints = {
        audio: {
            mandatory: {
                chromeMediaSource: "tab",
                chromeMediaSourceId: streamId,
            },
        } as unknown as ChromeTabAudioConstraints,
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

    processorNode.onaudioprocess = (event: AudioProcessingEvent) => {
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
                queueBufferedAudioUpload(packet);
            }
        }
    };

    // Start in paused mode.
    // Actual recording starts only after the video play event.
    isCapturing = false;
}

async function pauseTabCapture(): Promise<void> {
    if (!isCapturing) {
        return;
    }

    isCapturing = false;
    await flushBufferedAudio();
}

async function resumeTabCapture(): Promise<void> {
    if (!capturedStream || !audioContext || !processorNode) {
        throw new Error("Tab capture is not active");
    }

    await audioContext.resume();
    isCapturing = true;
}

async function stopTabCapture(): Promise<void> {
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

export const AudioCaptureController = {
    startTabCapture,
    pauseTabCapture,
    resumeTabCapture,
    stopTabCapture,
};
