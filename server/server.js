// Node server that transcribes audio chunks and broadcasts captions in real time.
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");
const WebSocket = require("ws");

const openai = require("./config/openai");
const { buildSummaryPdf } = require("./services/pdfService");
const { answerLectureQuestion } = require("./services/askService");

const app = express();
const port = 3000;

app.use(cors());
app.use(express.raw({ type: "audio/wav", limit: "2mb" }));
app.use(express.json());

const uploadsDir = "uploads/";
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const generatedPdfsDir = path.join(__dirname, "generated-pdfs");
if (!fs.existsSync(generatedPdfsDir)) {
  fs.mkdirSync(generatedPdfsDir, { recursive: true });
}

app.use("/generated-pdfs", express.static(generatedPdfsDir));

const wss = new WebSocket.Server({ port: 3001 });

function broadcast(text) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(text);
    }
  });
}


app.post("/stream", async (req, res) => {
  try {
    if (!req.body || req.body.length === 0) {
      return res.status(400).json({ error: "No audio data received" });
    }

    const tempFile = `${uploadsDir}chunk-${Date.now()}.wav`;
    fs.writeFileSync(tempFile, req.body);

    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(tempFile),
      model: "whisper-1",
      language: "he",
      response_format: "text",
    });

    fs.unlink(tempFile, () => console.log("Chunk deleted:", tempFile));
    broadcast(transcription);

    res.json({ text: transcription });
  } catch (err) {
    console.error("Stream error:", err.message);
    res.status(500).json({ error: "Failed to process stream" });
  }
});

app.post("/ask", async (req, res) => {
  try {
    const { question, transcript } = req.body;

    if (!question || !question.trim()) {
      return res.status(400).json({
        success: false,
        error: "No question provided",
      });
    }

    console.log("Answering lecture question:", question);

    const result = await answerLectureQuestion(question.trim(), transcript);

    console.log("Has transcript:", result.hasTranscript);
    console.log("Transcript length:", result.transcriptLength);

    res.json({
      success: true,
      answer: result.answer,
    });
  } catch (err) {
    console.error("Error answering lecture question:", err.message);

    res.status(500).json({
      success: false,
      error: "Failed to answer lecture question",
      details: err.message,
    });
  }
});

app.post("/summarize", async (req, res) => {
  try {
    const { text } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ error: "No transcription text provided" });
    }

    console.log("Generating summary for text of length:", text.length);

    const prompt = `אנא סכם את התמלול הבא בצורה מסודרת ומקצועית בעברית. הסיכום צריך לכלול:
1. נקודות עיקריות
2. נושאים מרכזיים
3. תובנות חשובות

התמלול:
${text}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "אתה עוזר מקצועי שמסכם תמלולים בעברית בצורה מסודרת וברורה.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 2000,
    });

    const summary = completion.choices[0].message.content;

    if (!summary) {
      return res.status(500).json({
        success: false,
        error: "Summary generation returned empty content",
      });
    }

    const pdfBuffer = await buildSummaryPdf(summary);

    const storedFilename = `${Date.now()}-${randomUUID()}.pdf`;
    const pdfFilePath = path.join(generatedPdfsDir, storedFilename);

    fs.writeFileSync(pdfFilePath, pdfBuffer);

    setTimeout(() => {
      fs.unlink(pdfFilePath, () => {});
    }, 10 * 60 * 1000);

    console.log("Summary generated successfully, length:", summary.length);

    res.json({
      success: true,
      summary,
      downloadUrl: `http://localhost:3000/generated-pdfs/${storedFilename}`,
      filename: "סיכום הרצאה.pdf",
    });
  } catch (err) {
    console.error("Error generating summary:", err.message);
    res.status(500).json({
      error: "Failed to generate summary",
      details: err.message,
    });
  }
});

app.listen(port, () => console.log(`HTTP Server running on port ${port}`));
console.log("WebSocket Server running on port 3001");