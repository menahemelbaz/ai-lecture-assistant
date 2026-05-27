/**
 * Start a PDF download from a regular HTTP URL.
 */
function downloadPdfFromUrl(downloadUrl, filename) {
    return new Promise((resolve, reject) => {
        chrome.downloads.download({
            url: downloadUrl,
            filename,
            saveAs: true,
        }, (downloadId) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
            }
            if (downloadId === undefined) {
                reject(new Error("Failed to start PDF download"));
                return;
            }
            resolve();
        });
    });
}
/**
 * Send the full transcript to the server and download the generated summary PDF.
 */
async function generateSummaryPdf(fullTranscript) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    try {
        const response = await fetch("http://localhost:3000/summarize", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: fullTranscript }),
            signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (!response.ok) {
            throw new Error(`Server returned ${response.status}: ${response.statusText}`);
        }
        const data = await response.json();
        if (data.success && data.downloadUrl) {
            await downloadPdfFromUrl(data.downloadUrl, data.filename || "סיכום הרצאה.pdf");
            return {
                ok: true,
                info: "PDF download started",
            };
        }
        throw new Error(data.error || "Failed to generate summary");
    }
    catch (err) {
        clearTimeout(timeoutId);
        const error = err;
        console.error("Error generating summary:", error);
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
            error: error.message || "שגיאה ביצירת הסיכום",
        };
    }
}
export const SummaryClient = {
    generateSummaryPdf,
};
