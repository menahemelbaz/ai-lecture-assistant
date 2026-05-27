import { TranscriptStore } from "./transcriptStore.js";
import { AskLectureClient } from "./askLectureClient.js";
import { SummaryClient } from "./summaryClient.js";
/**
 * Handle a lecture question request from the content script.
 */
async function handleAskLecture(msg, sender) {
    const requesterTabId = sender.tab?.id;
    const activeTabId = TranscriptStore.getActiveTabId();
    const question = msg.question?.trim();
    if (!question) {
        return {
            ok: false,
            error: "לא התקבלה שאלה תקינה.",
        };
    }
    let fullTranscript = "";
    if (requesterTabId !== undefined && requesterTabId === activeTabId) {
        fullTranscript = await TranscriptStore.getFullTranscript();
    }
    else {
        console.warn("ASK_LECTURE was sent without an active transcript session for this tab.");
    }
    return await AskLectureClient.askLecture(question, fullTranscript);
}
/**
 * Handle a lecture summary request from the content script.
 */
async function handleGenerateSummary(sender) {
    const requesterTabId = sender.tab?.id;
    const activeTabId = TranscriptStore.getActiveTabId();
    if (requesterTabId === undefined || requesterTabId !== activeTabId) {
        return {
            ok: false,
            error: "No active transcript session for this tab",
        };
    }
    const fullTranscript = await TranscriptStore.getFullTranscript();
    if (!fullTranscript) {
        return {
            ok: false,
            error: "אין תמלול זמין לסיכום, אנא הפעל הקלטה תחילה",
        };
    }
    return await SummaryClient.generateSummaryPdf(fullTranscript);
}
export const LectureActions = {
    handleAskLecture,
    handleGenerateSummary,
};
