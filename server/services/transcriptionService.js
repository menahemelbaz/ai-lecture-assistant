const fs = require("fs");
const openai = require("../config/openai");

// Transcribe an audio file using the OpenAI transcription API.
async function transcribeAudioFile(filePath) {
  const transcription = await openai.audio.transcriptions.create({
    file: fs.createReadStream(filePath),
    model: "whisper-1",
    language: "he",
    response_format: "text",
  });

  // Stop the flow if the transcription result is empty.
  if (!transcription || !transcription.trim()) {
    throw new Error("Transcription returned empty content");
  }

  return transcription;
}

module.exports = {
  transcribeAudioFile,
};
