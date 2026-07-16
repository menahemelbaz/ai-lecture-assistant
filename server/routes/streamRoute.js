const express = require("express");
const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");

const { transcribeAudioFile } = require("../services/transcriptionService");

function createStreamRoute({ uploadsDir, broadcast }) {
  const router = express.Router();

  router.post("/", async (req, res) => {
    let tempFile = null;

    try {
      if (!req.body || req.body.length === 0) {
        return res.status(400).json({ error: "No audio data received" });
      }

      tempFile = path.join(
        uploadsDir,
        `chunk-${Date.now()}-${randomUUID()}.wav`
      );

      fs.writeFileSync(tempFile, req.body);

      const transcription = await transcribeAudioFile(tempFile);

      if (transcription) {
        broadcast(transcription);
      }

      res.json({ text: transcription });
    } catch (err) {
      console.error("Stream error:", err.message);

      res.status(500).json({
        error: "Failed to process stream",
      });
    } finally {
      if (tempFile) {
        fs.unlink(tempFile, () => console.log("Chunk deleted:", tempFile));
      }
    }
  });

  return router;
}

module.exports = createStreamRoute;
