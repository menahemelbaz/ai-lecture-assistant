import { TranscriptStore } from "./transcriptStore.js";
import { AskLectureClient } from "./askLectureClient.js";
import { SummaryClient } from "./summaryClient.js";
// Handles a lecture question request from the content script.
async function handleAskLecture(msg, sender) {
    const requesterTabId = sender.tab?.id;
    const activeTabId = TranscriptStore.getActiveTabId();
    const question = msg.question?.trim();
    if (!question) {
        return {
            ok: false,
            error: "No valid question was received.",
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
// Handles a lecture summary request for the active transcript session.
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
            error: "No transcript is available for summarization. Please start recording first.",
        };
    }
    return await SummaryClient.generateSummaryPdf(fullTranscript);
}
export const LectureActions = {
    handleAskLecture,
    handleGenerateSummary,
};
