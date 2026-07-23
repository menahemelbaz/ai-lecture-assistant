// Load environment variables before initializing external services.
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

const app = express();
const port = 3000;

// Register middleware before mounting the application routes.
app.use(cors());
app.use(express.raw({ type: "audio/wav", limit: "2mb" }));
app.use(express.json());

// Ensure the directories required for temporary audio and generated PDFs exist.
const uploadsDir = "uploads/";

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const generatedPdfsDir = path.join(__dirname, "generated-pdfs");

if (!fs.existsSync(generatedPdfsDir)) {
  fs.mkdirSync(generatedPdfsDir, { recursive: true });
}

// Expose generated summary files for client downloads.
app.use("/generated-pdfs", express.static(generatedPdfsDir));

app.use(
  "/summarize",
  createSummarizeRoute({
    generatedPdfsDir,
  })
);

// Broadcast real-time transcript updates to all connected clients.
const wss = new WebSocket.Server({ port: 3001 });

function broadcast(text) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(text);
    }
  });
}

app.use(
  "/stream",
  createStreamRoute({
    uploadsDir,
    broadcast,
  })
);

app.use("/ask", askRoute);
app.use("/quiz", quizRoute);

app.listen(port, () => console.log(`HTTP Server running on port ${port}`));
console.log("WebSocket Server running on port 3001");