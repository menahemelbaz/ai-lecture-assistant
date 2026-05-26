const openai = require("../config/openai");

// Generate a structured Hebrew summary from lecture transcription text.
async function generateLectureSummary(text) {
  const prompt = `Summarize the following lecture transcript in Hebrew, in the style of a clear, organized, and professional study sheet.

The goal is to create an educational summary that feels like a well-written student study note, not just a short list of bullet points.

The summary must be written in Hebrew.

The summary should follow this structure:

1. Main title
- Write a short and clear title for the main topic of the lecture.
- If appropriate, use a title in the style of: "[Topic name] - What is it?"

2. General explanation
- Start with a short and clear explanation of the topic.
- Explain the main idea of the lecture.
- Use simple language that is suitable for a student learning the material.

3. Important concepts and notation
- If the transcript includes concepts, variables, notation, definitions, or names of components, present them clearly.
- For each concept or notation, write a short and clear explanation.
- Do not invent concepts or notation that do not appear in the transcript.

4. Main ideas or hypotheses
- Present the main ideas taught in the lecture.
- If the topic is mathematical, statistical, scientific, or theoretical, include hypotheses, principles, or main claims only if they appear in the transcript.

5. Work process / steps
- If the lecture explains a process, solution method, algorithm, test, or technique, divide it into clear steps.
- Use headings such as:
  First step:
  Second step:
  Third step:
- In each step, explain what is done and why.

6. Formulas and calculations
- If formulas appear in the transcript, write them clearly and neatly.
- Next to each formula, briefly explain what it measures or why it is used.
- Do not invent formulas that do not appear in the transcript.

7. Tips and important notes
- If the transcript includes shortcuts, tips, intuition, warnings, or important notes, present them under a suitable heading.
- Use phrases such as:
  Tip:
  Important note:
  For intuition:

8. Decision rules / conclusions
- If the lecture includes a way to make a decision, draw a conclusion, or choose an action, present it clearly.
- If no explicit decision rules appear in the transcript, do not invent them.

9. Writing style
- Write in clear and correct Hebrew.
- Keep the style educational, professional, and focused.
- Use subheadings.
- Use numbered lists when appropriate.
- Do not add general knowledge that was not said or implied in the transcript.
- Do not write that the summary is based on a transcript. Simply present the summary.

Lecture transcript:
${text}`;

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
