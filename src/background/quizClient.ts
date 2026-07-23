const QUIZ_TOPICS_URL = "http://localhost:3000/quiz/topics";
const QUIZ_QUESTION_URL = "http://localhost:3000/quiz/question";
const REQUEST_TIMEOUT_MS = 30000;

/**
 * Map a fetch/JSON error into a user-facing Hebrew message.
 */
function describeError(err: unknown): string {
    const error = err as Error;

    if (error.name === "TypeError" && error.message.includes("fetch")) {
        return "השרת לא פועל. אנא הפעל את השרת תחילה.";
    }

    if (error.name === "AbortError") {
        return "הבקשה ארכה זמן רב מדי. נסה שוב.";
    }

    return error.message || "שגיאה בתקשורת עם השרת.";
}

/**
 * Fetch the list of practice topics for the given transcript.
 */
async function fetchTopics(transcript: string): Promise<QuizTopicsResponse> {
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
            throw new Error(
                `Server returned ${response.status}: ${response.statusText}`
            );
        }

        const data: {
            success: boolean;
            enoughContent?: boolean;
            topics?: string[];
            error?: string;
        } = await response.json();

        if (!data.success) {
            return { ok: false, error: data.error || "שגיאה בקבלת נושאים." };
        }

        return {
            ok: true,
            enoughContent: data.enoughContent === true,
            topics: Array.isArray(data.topics) ? data.topics : [],
        };
    } catch (err) {
        clearTimeout(timeoutId);
        console.error("Error fetching quiz topics:", err);
        return { ok: false, error: describeError(err) };
    }
}

/**
 * Fetch one multiple-choice question for the given transcript and topic.
 */
async function fetchQuestion(
    transcript: string,
    topic: string
): Promise<QuizQuestionResponse> {
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
            throw new Error(
                `Server returned ${response.status}: ${response.statusText}`
            );
        }

        const data: {
            success: boolean;
            enoughContent?: boolean;
            question?: string;
            options?: QuizOption[];
            error?: string;
        } = await response.json();

        if (!data.success) {
            return { ok: false, error: data.error || "שגיאה בקבלת שאלה." };
        }

        if (data.enoughContent === false) {
            return { ok: true, enoughContent: false };
        }

        return {
            ok: true,
            enoughContent: true,
            question: data.question || "",
            options: Array.isArray(data.options) ? data.options : [],
        };
    } catch (err) {
        clearTimeout(timeoutId);
        console.error("Error fetching quiz question:", err);
        return { ok: false, error: describeError(err) };
    }
}

export const QuizClient = {
    fetchTopics,
    fetchQuestion,
};
