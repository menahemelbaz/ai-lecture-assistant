// Thin REST client for the OpenAI API, called directly from the extension.
//
// No OpenAI SDK and no bundler are used: the extension talks to the REST
// endpoints with fetch to keep the build a plain `tsc` step. The user's key is
// read through ApiKeyStore and never touched by content scripts.
//
// Every call resolves to a discriminated `{ ok, ... }` result following the
// convention used across the extension's clients, rather than throwing.
// Callers translate `errorKind` into user-facing messages.
import { ApiKeyStore } from "../background/apiKeyStore.js";
const CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions";
const TRANSCRIPTIONS_URL = "https://api.openai.com/v1/audio/transcriptions";
const DEFAULT_TIMEOUT_MS = 30000;
function classifyHttpError(status) {
    if (status === 401) {
        return "invalid_key";
    }
    if (status === 429) {
        return "quota";
    }
    return "request_failed";
}
async function fetchWithTimeout(url, init, timeoutMs) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...init, signal: controller.signal });
    }
    finally {
        clearTimeout(timeoutId);
    }
}
function describeRequestFailure(err) {
    const error = err;
    if (error.name === "AbortError") {
        return {
            errorKind: "request_failed",
            error: "The request took too long. Please try again.",
        };
    }
    return {
        errorKind: "request_failed",
        error: error.message || "Error communicating with OpenAI.",
    };
}
async function createChatCompletion(options, timeoutMs = DEFAULT_TIMEOUT_MS) {
    const apiKey = await ApiKeyStore.getApiKey();
    if (!apiKey) {
        return {
            ok: false,
            errorKind: "missing_key",
            error: "No API key is set. Please add your key in the extension options.",
        };
    }
    try {
        const response = await fetchWithTimeout(CHAT_COMPLETIONS_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify(options),
        }, timeoutMs);
        if (!response.ok) {
            return {
                ok: false,
                errorKind: classifyHttpError(response.status),
                error: `OpenAI returned ${response.status}: ${response.statusText}`,
            };
        }
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;
        if (!content) {
            return {
                ok: false,
                errorKind: "request_failed",
                error: "OpenAI returned an empty response.",
            };
        }
        return { ok: true, data: content };
    }
    catch (err) {
        const { errorKind, error } = describeRequestFailure(err);
        console.error("OpenAI chat completion error:", err);
        return { ok: false, errorKind, error };
    }
}
// Used later by the offscreen document once audio moves off the server.
async function transcribeAudio(audio, options, timeoutMs = DEFAULT_TIMEOUT_MS) {
    const apiKey = await ApiKeyStore.getApiKey();
    if (!apiKey) {
        return {
            ok: false,
            errorKind: "missing_key",
            error: "No API key is set. Please add your key in the extension options.",
        };
    }
    try {
        const form = new FormData();
        form.append("file", audio, "audio.wav");
        form.append("model", options.model);
        form.append("response_format", "text");
        if (options.language) {
            form.append("language", options.language);
        }
        const response = await fetchWithTimeout(TRANSCRIPTIONS_URL, {
            method: "POST",
            headers: {
                // No Content-Type header: the browser sets the multipart boundary.
                Authorization: `Bearer ${apiKey}`,
            },
            body: form,
        }, timeoutMs);
        if (!response.ok) {
            return {
                ok: false,
                errorKind: classifyHttpError(response.status),
                error: `OpenAI returned ${response.status}: ${response.statusText}`,
            };
        }
        const text = (await response.text()).trim();
        return { ok: true, data: text };
    }
    catch (err) {
        const { errorKind, error } = describeRequestFailure(err);
        console.error("OpenAI transcription error:", err);
        return { ok: false, errorKind, error };
    }
}
export const OpenAiClient = {
    createChatCompletion,
    transcribeAudio,
};
