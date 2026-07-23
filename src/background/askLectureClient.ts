// Sends a lecture question and transcript to the server.
async function askLecture(
  question: string,
  transcript: string
): Promise<AskLectureResponse> {
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
      throw new Error(
        `Server returned ${response.status}: ${response.statusText}`
      );
    }

    const data: {
      success: boolean;
      answer?: string;
      error?: string;
    } = await response.json();

    if (!data.success) {
      return {
        ok: false,
        error: data.error || "Error receiving a response from the server.",
      };
    }

    return {
      ok: true,
      answer: data.answer || "No response was received from the server.",
    };
  } catch (err) {
    clearTimeout(timeoutId);

    const error = err as Error;
    console.error("Error asking lecture question:", error);

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
      error: error.message || "Error receiving a response from the server.",
    };
  }
}

export const AskLectureClient = {
  askLecture,
};