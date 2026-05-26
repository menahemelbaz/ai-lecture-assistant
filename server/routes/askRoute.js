const express = require("express");
const { answerLectureQuestion } = require("../services/askService");

const router = express.Router();

router.post("/", async (req, res) => {
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

module.exports = router;
