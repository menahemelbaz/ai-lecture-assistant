// Load environment variables before using external services.
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const askRoute = require("./routes/askRoute");
const createStreamRoute = require("./routes/streamRoute");
const createSummarizeRoute = require("./routes/summarizeRoute");
const quizRoute = require("./routes/quizRoute");

// Create the Express application.
const app = express();
const port = 3000;

// Register global middleware.
app.use(cors());
app.use(express.raw({ type: "audio/wav", limit: "2mb" }));
app.use(express.json());

// Ensure the uploads directory exists before saving temporary audio chunks.
const uploadsDir = "uploads/";
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Ensure the generated PDFs directory exists before writing summary files.
const generatedPdfsDir = path.join(__dirname, "generated-pdfs");
if (!fs.existsSync(generatedPdfsDir)) {
  fs.mkdirSync(generatedPdfsDir, { recursive: true });
}

// Expose generated PDFs so the client can download them.
app.use("/generated-pdfs", express.static(generatedPdfsDir));

// Register the summary route and provide the PDF output directory.
app.use(
  "/summarize",
  createSummarizeRoute({
    generatedPdfsDir,
  })
);

// Create a WebSocket server for real-time transcription updates.
const wss = new WebSocket.Server({ port: 3001 });

// Send text to every currently connected WebSocket client.
function broadcast(text) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(text);
    }
  });
}

// Register the stream route and provide its required dependencies.
app.use(
  "/stream",
  createStreamRoute({
    uploadsDir,
    broadcast,
  })
);

// Register the route that answers questions based on the lecture transcript.
app.use("/ask", askRoute);

app.use("/quiz", quizRoute);

app.listen(port, () => console.log(`HTTP Server running on port ${port}`));
console.log("WebSocket Server running on port 3001");
