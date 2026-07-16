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

  if (!transcription || !transcription.trim()) {
    return "";
  }

  return transcription.trim();
}

module.exports = {
  transcribeAudioFile,
};
