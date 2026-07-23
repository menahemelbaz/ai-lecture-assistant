// Starts a PDF download from a standard HTTP URL.
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
// Sends the transcript to the server and downloads the generated summary PDF.
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
            await downloadPdfFromUrl(data.downloadUrl, data.filename || "Lecture Summary.pdf");
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
                error: "The server is not running. Please start the server first.",
            };
        }
        if (error.name === "AbortError") {
            return {
                ok: false,
                error: "The request took too long. Please try again.",
            };
        }
        return {
            ok: false,
            error: error.message || "Error generating the summary.",
        };
    }
}
export const SummaryClient = {
    generateSummaryPdf,
};
