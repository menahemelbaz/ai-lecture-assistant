import { OpenAiClient } from "../config/openaiClient.js";
import { buildAskMessages } from "./prompts.js";
import { describeErrorKind } from "./errorMessages.js";

const MODEL = "gpt-4o-mini";

async function askLecture(
  question: string,
  transcript: string
): Promise<AskLectureResponse> {
  const result = await OpenAiClient.createChatCompletion({
    model: MODEL,
    messages: buildAskMessages(question, transcript),
    temperature: 0.4,
    max_tokens: 1000,
  });

  if (!result.ok) {
    return {
      ok: false,
      error: describeErrorKind(
        result.errorKind,
        result.error || "Error receiving a response from the server."
      ),
    };
  }

  return { ok: true, answer: result.data };
}

export const AskLectureClient = {
  askLecture,
};