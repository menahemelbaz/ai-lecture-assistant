const openai = require("../config/openai");

async function answerLectureQuestion(question, transcript) {
  const hasTranscript = Boolean(transcript && transcript.trim());

  const lectureTranscript = hasTranscript
    ? transcript.trim()
    : "לא קיים תמלול זמין להרצאה כרגע.";

  const systemPrompt = `
אתה עוזר למידה אישי עבור הרצאות מוקלטות.

התפקיד שלך הוא לענות על שאלות של סטודנטים.

כללים:
1. אם יש תמלול הרצאה זמין, קודם כל נסה לענות על בסיס התמלול.
2. אם התמלול מכיל מספיק מידע, ענה לפי התמלול.
3. אם אין תמלול זמין או שאין מספיק מידע בתמלול, אמור זאת במפורש.
4. במקרה שאין מספיק מידע מההרצאה, מותר לך לתת הסבר כללי מהידע שלך.
5. אל תציג ידע כללי כאילו הוא נאמר בהרצאה.
6. ענה באותה שפה שבה המשתמש שאל.
7. שמור על תשובה ברורה, ממוקדת ולימודית.
`;

  const userPrompt = `
שאלת המשתמש:
${question}

תמלול ההרצאה:
${lectureTranscript}
`;

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
