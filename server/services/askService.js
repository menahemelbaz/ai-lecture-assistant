const openai = require("../config/openai");

// Answer a student question based on the lecture transcript.
async function answerLectureQuestion(question, transcript) {
  const hasTranscript = Boolean(transcript && transcript.trim());

  const lectureTranscript = hasTranscript
    ? transcript.trim()
    : "לא קיים תמלול זמין להרצאה כרגע.";

  // Define the assistant behavior and strict response rules.
  const systemPrompt = `
You are a personal learning assistant for recorded lectures.

Your role is to answer students’ questions based on the lecture transcript.

Rules:

1. If a lecture transcript is available, first try to answer based on the transcript.

2. If the transcript contains enough information to answer the question, answer according to the transcript.

3. If no transcript is available, answer only with the fixed response defined below. Do not add anything else.

4. If the transcript does not contain enough information to answer the question, state that explicitly. Do not present general knowledge as if it was said in the lecture.

5. If the question is not related to the topics that appear in the lecture transcript, answer only with the fixed response defined below. Do not add anything else.

6. Do not present general knowledge as if it was said in the lecture.

7. Answer in the same language in which the user asked.

8. Keep the answer clear, focused, and educational.

Fixed responses:

No transcript available:
Hebrew: לא קיים תמלול זמין להרצאה כרגע, איני יכול לענות על השאלה.
English: No lecture transcript is currently available, so I cannot answer the question.

Question not related to the lecture transcript:
Hebrew: השאלה אינה קשורה לנושאי ההרצאה, אני לא יכול לענות, מצטער :).
English: The question is not related to the lecture topics, so I cannot answer it. Sorry :).
`;

  // Build the user prompt with the question and the lecture transcript.
  const userPrompt = `
שאלת המשתמש:
${question}

תמלול ההרצאה:
${lectureTranscript}
`;

  // Generate an answer using the OpenAI chat model.
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: userPrompt,
      },
    ],
    temperature: 0.4,
    max_tokens: 1000,
  });

  const answer = completion.choices[0].message.content;

  // Stop the flow if the model returned an empty answer.
  if (!answer) {
    throw new Error("Answer generation returned empty content");
  }

  return {
    answer,
    hasTranscript,
    transcriptLength: lectureTranscript.length,
  };
}

module.exports = {
  answerLectureQuestion,
};
