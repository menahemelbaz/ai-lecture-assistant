// Node server that transcribes audio chunks and broadcasts captions in real time.
// Expose configuration values defined in the local .env file.
require("dotenv").config();

// Core dependencies for HTTP handling, file uploads, filesystem access, and OpenAI.
const express = require("express");
const multer = require("multer");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const { OpenAI } = require("openai");
const puppeteer = require("puppeteer");

// Utilities for spawning the Python recorder and broadcasting over WebSockets.
const { spawn } = require("child_process");
const WebSocket = require("ws");

// Initialize the HTTP server instance.
const app = express();

// Default HTTP port used by the transcription API.
const port = 3000;

// Allow the extension and other origins to access the HTTP endpoints.
app.use(cors());

// Accept raw audio bodies posted as small WAV files (must be before json middleware).
app.use(express.raw({ type: "audio/wav", limit: "2mb" }));

// Allow JSON payloads for control endpoints.
app.use(express.json());

// Ensure uploads directory exists.
const uploadsDir = "uploads/";
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure disk storage for traditional file uploads handled via Multer.
const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, cb) => {
    const extension = path.extname(file.originalname) || ".webm";
    cb(null, file.fieldname + "-" + Date.now() + extension);
  }
});
const upload = multer({ storage });

// Client used to call OpenAI Whisper for both streaming and batch requests.
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// WebSocket server that streams live transcription text to connected clients.
const wss = new WebSocket.Server({ port: 3001 });

// Sends a text payload to each currently connected WebSocket client.
function broadcast(text) {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(text);
    }
  });
}

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function buildSummaryPdf(summary) {
  const browser = await puppeteer.launch({
    headless: true,
  });

  try {
    const page = await browser.newPage();

    const safeSummary = escapeHtml(summary).replace(/\n/g, "<br>");

    const html = `
      <!DOCTYPE html>
      <html lang="he" dir="rtl">
        <head>
          <meta charset="UTF-8" />
          <style>
            body {
              font-family: Arial, sans-serif;
              direction: rtl;
              text-align: right;
              margin: 40px;
              line-height: 1.8;
              font-size: 14px;
              color: #111;
            }

            h1 {
              font-size: 24px;
              margin-bottom: 24px;
            }

            .content {
              white-space: normal;
              word-break: break-word;
            }
          </style>
        </head>
        <body>
          <h1>סיכום הרצאה</h1>
          <div class="content">${safeSummary}</div>
        </body>
      </html>
    `;

    await page.setContent(html, { waitUntil: "networkidle0" });

    return await page.pdf({
      format: "A4",
      printBackground: true,
      margin: {
        top: "20mm",
        right: "15mm",
        bottom: "20mm",
        left: "15mm",
      },
    });
  } finally {
    await browser.close();
  }
}

// Holds a reference to the active Python audio capture process (if any).
let activePythonProcess = null;

// Handles traditional file uploads and returns a full transcription response.
app.post("/transcribe", upload.single("audio"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).send({ error: "No audio file uploaded" });

    const audioFilePath = req.file.path;
    console.log("Received file:", audioFilePath);

    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(audioFilePath),
      model: "whisper-1",
      language: "he",
      response_format: "text",
    });

    fs.unlink(audioFilePath, () => console.log("Deleted:", audioFilePath));

    // Forward the transcription to all listening WebSocket clients.
    broadcast(transcription);

    res.send({ text: transcription });
  } catch (err) {
    console.error("Error:", err.message);
    res.status(500).send({ error: "Failed to transcribe audio" });
  }
});

// Accepts short WAV chunks posted by the Python recorder and broadcasts results.
app.post("/stream", async (req, res) => {
  try {
    // Validate that we received audio data.
    if (!req.body || req.body.length === 0) {
      return res.status(400).json({ error: "No audio data received" });
    }

    // Persist the raw request body so Whisper can read it from disk.
    const tempFile = `${uploadsDir}chunk-${Date.now()}.wav`;
    fs.writeFileSync(tempFile, req.body);

    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(tempFile),
      model: "whisper-1",
      language: "he",
      response_format: "text",
    });

    fs.unlink(tempFile, () => console.log("Chunk deleted:", tempFile));

    // Push the transcribed text to every active WebSocket listener.
    broadcast(transcription);

    // Return the transcription to the Python recorder for logging.
    res.json({ text: transcription });
  } catch (err) {
    console.error("Stream error:", err.message);
    res.status(500).json({ error: "Failed to process stream" });
  }
});

// Spins up the Python recorder when playback begins in the browser.
app.post("/start-recording", (req, res) => {
  console.log("Received request to start recording...");

  // Reject duplicate start requests when a recorder is already active.
  if (activePythonProcess) {
    console.warn("Recording already in progress");
    return res.status(409).json({
      error: "Recording already active",
      pid: activePythonProcess.pid
    });
  }

  // Path pointing to the Python script that captures system audio.
  const pythonScript = path.join(__dirname, "audio_capture.py");

  // Launch the Python process and retain stdout/stderr pipes for logging.
  activePythonProcess = spawn("python3", [pythonScript], {
    stdio: ["ignore", "pipe", "pipe"]
  });

  const pid = activePythonProcess.pid;
  console.log(`Python process started with PID: ${pid}`);

  // Mirror stdout from the Python helper for easier debugging.
  activePythonProcess.stdout.on("data", (data) => {
    console.log(`[Python]: ${data.toString().trim()}`);
  });

  activePythonProcess.stderr.on("data", (data) => {
    console.error(`[Python Error]: ${data.toString().trim()}`);
  });

  // Clear the process reference once the Python helper exits naturally.
  activePythonProcess.on("close", (code, signal) => {
    console.log(`Python process exited with code ${code}, signal ${signal}`);
    activePythonProcess = null;
  });

  activePythonProcess.on("error", (err) => {
    console.error("Failed to start Python process:", err);
    activePythonProcess = null;
  });

  res.json({
    message: "Recording started!",
    pid: pid
  });
});

// Terminates the Python recorder when playback is paused or stopped.
app.post("/stop-recording", (req, res) => {
  console.log("Received request to stop recording...");

  // Let the caller know when no recorder is currently active.
  if (!activePythonProcess) {
    console.warn("No active recording to stop");
    return res.status(404).json({ error: "No active recording" });
  }

  const pid = activePythonProcess.pid;

  try {
    // Ask the Python process to terminate gracefully.
    const processToKill = activePythonProcess;
    activePythonProcess = null;
    let hasExited = false;

    processToKill.once("close", () => {
      hasExited = true;
    });

    processToKill.kill("SIGTERM");

    // Force kill the process if it fails to exit within two seconds.
    setTimeout(() => {
      if (!hasExited) {
        console.warn("Process didn't terminate, force killing...");
        processToKill.kill("SIGKILL");
      }
    }, 2000);

    console.log(`Recording stopped (PID: ${pid})`);

    res.json({
      message: "Recording stopped.",
      pid: pid
    });
  } catch (err) {
    console.error("Error stopping recording:", err);
    activePythonProcess = null;
    res.status(500).json({ error: "Failed to stop recording" });
  }
});

// Generates a summary of the transcription using GPT and returns it with a PDF payload.
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
          content: "אתה עוזר מקצועי שמסכם תמלולים בעברית בצורה מסודרת וברורה."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 2000
    });

    const summary = completion.choices[0].message.content;

    if (!summary) {
      return res.status(500).json({
        success: false,
        error: "Summary generation returned empty content"
      });
    }

    const pdfBuffer = await buildSummaryPdf(summary);

    console.log("Summary generated successfully, length:", summary.length);

    res.json({
      success: true,
      summary,
      pdfBase64: pdfBuffer.toString("base64"),
      filename: "סיכום הרצאה.pdf"
    });
  } catch (err) {
    console.error("Error generating summary:", err.message);
    res.status(500).json({
      error: "Failed to generate summary",
      details: err.message
    });
  }
});

// Start the HTTP and WebSocket servers for incoming connections.
app.listen(port, () => console.log(`HTTP Server running on port ${port}`));
console.log("WebSocket Server running on port 3001");