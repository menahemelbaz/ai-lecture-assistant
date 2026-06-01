const openai = require("../config/openai");

// Generate a structured Hebrew summary from lecture transcription text.
async function generateLectureSummary(text) {
  const prompt = `Summarize the following lecture transcript in Hebrew.

Write the summary as a clear, schematic study sheet.
The summary must follow the order in which the lecture topics appear.
Do not organize the summary into fixed categories such as main ideas, formulas, concepts, or conclusions.

Instructions:
- Write a short and clear main title.
- Divide the summary into sections according to the natural flow of the lecture.
- Use short and clear subheadings.
- Explain important ideas briefly and clearly.
- If concepts, definitions, notation, formulas, or steps appear, include them in the relevant place according to their order in the lecture.
- Do not add general knowledge, examples, formulas, or conclusions that were not said or clearly implied in the transcript.
- Do not mention that the summary is based on a transcript.
- Output only the final Hebrew summary.

Lecture transcript:
"""
${text}
"""`;

  // Send the transcription text to the OpenAI chat model for summarization.
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "You are a professional assistant that summarizes Hebrew lecture transcripts into clear, organized, and educational Hebrew study sheets for students.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
    temperature: 0.7,
    max_tokens: 2000,
  });

  const summary = completion.choices[0].message.content;

  // Stop the flow if the model returned an empty summary.
  if (!summary) {
    throw new Error("Summary generation returned empty content");
  }

  return summary;
}

module.exports = {
  generateLectureSummary,
};
