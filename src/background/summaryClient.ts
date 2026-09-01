import { OpenAiClient } from "../config/openaiClient.js";
import { buildSummaryMessages } from "./prompts.js";
import { buildSummaryHtml } from "./summaryHtml.js";
import { describeErrorKind } from "./errorMessages.js";

const MODEL = "gpt-4o-mini";

// Generates the lecture summary directly from OpenAI and returns it as a
// printable HTML document. Printing happens in the content script, which is the
// only context with a usable print dialog.
async function generateSummaryHtml(
  fullTranscript: string
): Promise<SummaryResponse> {
  const result = await OpenAiClient.createChatCompletion({
    model: MODEL,
    messages: buildSummaryMessages(fullTranscript),
    temperature: 0.7,
    max_tokens: 4000,
  });

  if (!result.ok) {
    return {
      ok: false,
      error: describeErrorKind(
        result.errorKind,
        result.error || "Error generating the summary."
      ),
    };
  }

  return {
    ok: true,
    html: buildSummaryHtml(result.data),
  };
}

export const SummaryClient = {
  generateSummaryHtml,
};