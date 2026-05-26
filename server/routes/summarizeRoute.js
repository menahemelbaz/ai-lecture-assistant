const express = require("express");
const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");

const { buildSummaryPdf } = require("../services/pdfService");
const { generateLectureSummary } = require("../services/summaryService");

function createSummarizeRoute({ generatedPdfsDir }) {
  const router = express.Router();

  router.post("/", async (req, res) => {
    try {
      const { text } = req.body;

      if (!text || !text.trim()) {
        return res.status(400).json({
          error: "No transcription text provided",
        });
      }

      console.log("Generating summary for text of length:", text.length);

      const summary = await generateLectureSummary(text);
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

  return router;
}

module.exports = createSummarizeRoute;
