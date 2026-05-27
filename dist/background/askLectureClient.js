/**
 * Send a lecture question and transcript to the server.
 */
async function askLecture(question, transcript) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    try {
        const response = await fetch("http://localhost:3000/ask", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                question,
                transcript,
            }),
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
                error: data.error || "שגיאה בקבלת תשובה מהשרת.",
            };
        }
        return {
            ok: true,
            answer: data.answer || "לא התקבלה תשובה מהשרת.",
        };
    }
    catch (err) {
        clearTimeout(timeoutId);
        const error = err;
        console.error("Error asking lecture question:", error);
        if (error.name === "TypeError" && error.message.includes("fetch")) {
            return {
                ok: false,
                error: "השרת לא פועל. אנא הפעל את השרת תחילה.",
            };
        }
        if (error.name === "AbortError") {
            return {
                ok: false,
                error: "הבקשה ארכה זמן רב מדי. נסה שוב.",
            };
        }
        return {
            ok: false,
            error: error.message || "שגיאה בקבלת תשובה מהשרת.",
        };
    }
}
export const AskLectureClient = {
    askLecture,
};
