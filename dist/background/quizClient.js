import { OpenAiClient } from "../config/openaiClient.js";
import { buildQuizTopicsMessages, buildQuizQuestionMessages, } from "./prompts.js";
import { describeErrorKind } from "./errorMessages.js";
const MODEL = "gpt-4o-mini";
// A tiny floor that only guards against an essentially empty transcript. The
// real "is there enough to practice?" judgment is left to the model, which
// returns an empty topic list when there is nothing substantive.
const MIN_NONEMPTY_LENGTH = 20;
// Validates a parsed value as a well-formed question with exactly one correct
// option out of four, before it is handed to the UI.
function isValidQuizQuestion(value) {
    if (!value || typeof value !== "object") {
        return false;
    }
    const candidate = value;
    if (typeof candidate.question !== "string" || !candidate.question.trim()) {
        return false;
    }
    if (!Array.isArray(candidate.options) || candidate.options.length !== 4) {
        return false;
    }
    const allOptionsValid = candidate.options.every((opt) => !!opt &&
        typeof opt === "object" &&
        typeof opt.text === "string" &&
        opt.text.trim().length > 0 &&
        typeof opt.isCorrect === "boolean" &&
        typeof opt.explanation === "string" &&
        opt.explanation.trim().length > 0);
    if (!allOptionsValid) {
        return false;
    }
    const correctCount = candidate.options.filter((opt) => opt.isCorrect === true).length;
    return correctCount === 1;
}
async function fetchTopics(transcript) {
    const cleaned = transcript.trim();
    if (cleaned.length < MIN_NONEMPTY_LENGTH) {
        return { ok: true, enoughContent: false };
    }
    const result = await OpenAiClient.createChatCompletion({
        model: MODEL,
        messages: buildQuizTopicsMessages(cleaned),
        temperature: 0.3,
        max_tokens: 300,
        response_format: { type: "json_object" },
    });
    if (!result.ok) {
        return {
            ok: false,
            error: describeErrorKind(result.errorKind, result.error || "Error receiving quiz topics."),
        };
    }
    let parsed;
    try {
        parsed = JSON.parse(result.data);
    }
    catch {
        return { ok: false, error: "Topic mapping returned invalid JSON." };
    }
    const rawTopics = parsed.topics;
    const topics = Array.isArray(rawTopics)
        ? rawTopics
            .filter((t) => typeof t === "string" && t.trim().length > 0)
            .map((t) => t.trim())
            .slice(0, 4)
        : [];
    if (topics.length === 0) {
        return { ok: true, enoughContent: false };
    }
    return { ok: true, enoughContent: true, topics };
}
async function fetchQuestion(transcript, topic) {
    const cleaned = transcript.trim();
    const cleanedTopic = topic.trim();
    if (cleaned.length < MIN_NONEMPTY_LENGTH) {
        return { ok: true, enoughContent: false };
    }
    if (!cleanedTopic) {
        return { ok: false, error: "No topic provided for question generation." };
    }
    const result = await OpenAiClient.createChatCompletion({
        model: MODEL,
        messages: buildQuizQuestionMessages(cleanedTopic, cleaned),
        temperature: 0.6,
        max_tokens: 800,
        response_format: { type: "json_object" },
    });
    if (!result.ok) {
        return {
            ok: false,
            error: describeErrorKind(result.errorKind, result.error || "Error receiving a quiz question."),
        };
    }
    let parsed;
    try {
        parsed = JSON.parse(result.data);
    }
    catch {
        return { ok: false, error: "Question generation returned invalid JSON." };
    }
    if (!isValidQuizQuestion(parsed)) {
        return {
            ok: false,
            error: "Question generation returned a malformed question.",
        };
    }
    return {
        ok: true,
        enoughContent: true,
        question: parsed.question.trim(),
        options: parsed.options.map((opt) => ({
            text: opt.text.trim(),
            isCorrect: opt.isCorrect,
            explanation: opt.explanation.trim(),
        })),
    };
}
export const QuizClient = {
    fetchTopics,
    fetchQuestion,
};
