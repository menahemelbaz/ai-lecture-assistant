const QUIZ_TOPICS_URL = "http://localhost:3000/quiz/topics";
const QUIZ_QUESTION_URL = "http://localhost:3000/quiz/question";
const REQUEST_TIMEOUT_MS = 30000;
// Converts request and parsing failures into user-facing error messages.
function describeError(err) {
    const error = err;
    if (error.name === "TypeError" && error.message.includes("fetch")) {
        return "The server is not running. Please start the server first.";
    }
    if (error.name === "AbortError") {
        return "The request took too long. Please try again.";
    }
    return error.message || "Error communicating with the server.";
}
// Requests practice topics based on the provided lecture transcript.
async function fetchTopics(transcript) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
        const response = await fetch(QUIZ_TOPICS_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ transcript }),
            signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (!response.ok) {
            throw new Error(`Server returned ${response.status}: ${response.statusText}`);
        }
        const data = await response.json();
        if (!data.success) {
            return {
                ok: false,
                error: data.error || "Error receiving quiz topics.",
            };
        }
        return {
            ok: true,
            enoughContent: data.enoughContent === true,
            topics: Array.isArray(data.topics) ? data.topics : [],
        };
    }
    catch (err) {
        clearTimeout(timeoutId);
        console.error("Error fetching quiz topics:", err);
        return {
            ok: false,
            error: describeError(err),
        };
    }
}
// Requests one multiple-choice question for the selected lecture topic.
async function fetchQuestion(transcript, topic) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
        const response = await fetch(QUIZ_QUESTION_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ transcript, topic }),
            signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (!response.ok) {
            throw new Error(`Server returned ${response.status}: ${response.statusText}`);
        }
        const data = await response.json();
        if (!data.success) {
            return {
                ok: false,
                error: data.error || "Error receiving a quiz question.",
            };
        }
        if (data.enoughContent === false) {
            return {
                ok: true,
                enoughContent: false,
            };
        }
        return {
            ok: true,
            enoughContent: true,
            question: data.question || "",
            options: Array.isArray(data.options) ? data.options : [],
        };
    }
    catch (err) {
        clearTimeout(timeoutId);
        console.error("Error fetching quiz question:", err);
        return {
            ok: false,
            error: describeError(err),
        };
    }
}
export const QuizClient = {
    fetchTopics,
    fetchQuestion,
};
