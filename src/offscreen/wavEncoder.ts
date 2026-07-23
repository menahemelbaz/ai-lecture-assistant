// Represents buffered mono audio awaiting WAV encoding.
export type BufferedAudioPacket = {
    chunks: Float32Array[];
    totalSamples: number;
};

// Converts normalized floating-point samples to signed 16-bit PCM values.
function floatTo16BitPCM(
    view: DataView,
    offset: number,
    input: Float32Array
): number {
    let currentOffset = offset;

    for (let i = 0; i < input.length; i++) {
        const sample = Math.max(-1, Math.min(1, input[i]));

        view.setInt16(
            currentOffset,
            sample < 0 ? sample * 0x8000 : sample * 0x7fff,
            true
        );

        currentOffset += 2;
    }

    return currentOffset;
}

// Writes the standard 44-byte header for a mono 16-bit PCM WAV file.
function writeWavHeader(
    view: DataView,
    totalSamples: number,
    sampleRate: number
): void {
    const bytesPerSample = 2;
    const channels = 1;
    const dataLength = totalSamples * bytesPerSample;
    const blockAlign = channels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;

    // Chunk identifiers use byte order that preserves their ASCII representation.
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
    view.setUint16(34, 16, true); // Bits per sample
    view.setUint32(36, 0x64617461, false); // "data"
    view.setUint32(40, dataLength, true);
}

// Encodes the buffered audio chunks as a mono 16-bit PCM WAV buffer.
export function buildWavBuffer(
    packet: BufferedAudioPacket,
    sampleRate: number
): ArrayBuffer {
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