import type { OpenAiErrorKind } from "../config/openaiClient.js";

// Shared by the background clients so the wording stays consistent across
// chat, quiz, and summary.
export function describeErrorKind(
    kind: OpenAiErrorKind,
    fallback: string
): string {
    switch (kind) {
        case "missing_key":
            return "No API key is set. Open the extension options and add your OpenAI key.";
        case "invalid_key":
            return "The API key was rejected. Check the key in the extension options.";
        case "quota":
            return "Your OpenAI quota is exhausted or rate-limited. Please try again later.";
        default:
            return fallback;
    }
}