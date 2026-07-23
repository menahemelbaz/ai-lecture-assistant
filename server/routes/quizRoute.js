const express = require("express");
const {
    mapLectureTopics,
    generateQuizQuestion,
} = require("../services/quizService");

const router = express.Router();

// Map the lecture transcript into a short list of practice topics.
router.post("/topics", async (req, res) => {
    try {
        const { transcript } = req.body;

        const result = await mapLectureTopics(transcript);

        if (!result.enoughContent) {
            return res.json({
                success: true,
                enoughContent: false,
                topics: [],
            });
        }

        res.json({
            success: true,
            enoughContent: true,
            topics: result.topics,
        });
    } catch (err) {
        console.error("Error mapping lecture topics:", err.message);

        res.status(500).json({
            success: false,
            error: "Failed to map lecture topics",
            details: err.message,
        });
    }
});

// Generate one multiple-choice question about a chosen topic.
router.post("/question", async (req, res) => {
    try {
        const { transcript, topic } = req.body;

        if (!topic || !topic.trim()) {
            return res.status(400).json({
                success: false,
                error: "No topic provided",
            });
        }

        const result = await generateQuizQuestion(transcript, topic.trim());

        if (!result.enoughContent) {
            return res.json({
                success: true,
                enoughContent: false,
            });
        }

        res.json({
            success: true,
            enoughContent: true,
            question: result.question,
            options: result.options,
        });
    } catch (err) {
        console.error("Error generating quiz question:", err.message);

        res.status(500).json({
            success: false,
            error: "Failed to generate quiz question",
            details: err.message,
        });
    }
});

module.exports = router;
