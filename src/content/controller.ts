// Current quiz topic being practiced, kept between questions.
let activeQuizTopic: string | null = null;

window.Controller = {
  createChat(): HTMLDivElement {
    const existingPanel = document.getElementById("lecture-chat-panel");

    if (existingPanel) {
      return existingPanel as HTMLDivElement;
    }

    const panel = document.createElement("div");
    panel.id = "lecture-chat-panel";

    panel.innerHTML = `
      <div id="lecture-chat-header">
        <button id="lecture-chat-close" title="Close chat">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>

      <div id="lecture-chat-messages"></div>

      <div id="lecture-chat-input-row">
        <input
          id="lecture-chat-input"
          type="text"
          placeholder="Type your question"
        />
        <button
          id="lecture-chat-send"
          title="Send question"
          aria-label="Send question"
        >
          <i class="fa-solid fa-arrow-up"></i>
        </button>
      </div>
    `;

    document.body.appendChild(panel);

    const closeButton = document.getElementById(
      "lecture-chat-close"
    ) as HTMLButtonElement;

    const sendButton = document.getElementById(
      "lecture-chat-send"
    ) as HTMLButtonElement;

    const input = document.getElementById(
      "lecture-chat-input"
    ) as HTMLInputElement;

    closeButton.addEventListener("click", () => {
      panel.style.display = "none";
    });

    sendButton.addEventListener("click", () => {
      Controller.sendChatMessage();
    });

    input.addEventListener("keydown", (event: KeyboardEvent) => {
      if (event.key === "Enter") {
        Controller.sendChatMessage();
      }
    });

    // Restore any saved chat history for the current session, once.
    Controller.restoreChatHistory();

    return panel;
  },

  /**
   * Load saved chat exchanges from the background and render them. Runs once
   * per panel creation; guards against double-rendering with a data flag.
   */
  restoreChatHistory(): void {
    const messagesContainer = document.getElementById(
      "lecture-chat-messages"
    );

    if (!messagesContainer) {
      return;
    }

    // Only restore once.
    if (messagesContainer.dataset.restored === "true") {
      return;
    }

    messagesContainer.dataset.restored = "true";

    chrome.runtime.sendMessage(
      { type: "GET_CHAT_HISTORY" },
      (response: ChatHistoryResponse) => {
        if (chrome.runtime.lastError) {
          return;
        }

        if (!response?.ok || !Array.isArray(response.history)) {
          return;
        }

        for (const exchange of response.history) {
          // Reuse addChatMessage, which inserts text via textContent (XSS-safe).
          Controller.addChatMessage(exchange.question, "user");
          Controller.addChatMessage(exchange.answer, "assistant");
        }
      }
    );
  },

  toggleChatPanel(): void {
    const panel = Controller.createChat();

    if (panel.style.display === "none" || panel.style.display === "") {
      panel.style.display = "flex";
      return;
    }

    panel.style.display = "none";
  },

  createQuizPanel(): HTMLDivElement {
    const existingOverlay = document.getElementById("lecture-quiz-overlay");

    if (existingOverlay) {
      return existingOverlay as HTMLDivElement;
    }

    // The overlay covers the whole screen with a dark backdrop and centers the
    // modal. The modal's static structure is set here; all model-generated text
    // (topics, questions, options, explanations) is inserted later via
    // textContent / createElement, never innerHTML, to keep the XSS-safe
    // boundary.
    const overlay = document.createElement("div");
    overlay.id = "lecture-quiz-overlay";

    overlay.innerHTML = `
      <div id="lecture-quiz-modal">
        <div id="lecture-quiz-header">
          <span id="lecture-quiz-title">תרגול נושאי ההרצאה</span>
          <button id="lecture-quiz-close" title="Close quiz">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>

        <div id="lecture-quiz-body"></div>
      </div>
    `;

    document.body.appendChild(overlay);

    const modal = document.getElementById(
      "lecture-quiz-modal"
    ) as HTMLDivElement;

    const closeButton = document.getElementById(
      "lecture-quiz-close"
    ) as HTMLButtonElement;

    // Close on the X button.
    closeButton.addEventListener("click", () => {
      overlay.style.display = "none";
    });

    // Close when clicking the dark backdrop...
    overlay.addEventListener("click", () => {
      overlay.style.display = "none";
    });

    // ...but NOT when clicking inside the modal itself.
    modal.addEventListener("click", (event: MouseEvent) => {
      event.stopPropagation();
    });

    return overlay;
  },

  toggleQuizPanel(): void {
    const overlay = Controller.createQuizPanel();

    if (overlay.style.display === "none" || overlay.style.display === "") {
      overlay.style.display = "flex";

      // Every time the quiz is opened, start fresh from topic selection.
      activeQuizTopic = null;
      Controller.loadQuizTopics();

      return;
    }

    overlay.style.display = "none";
  },

  /**
   * Replace the quiz body with a single centered status message.
   */
  setQuizStatus(text: string): void {
    const body = document.getElementById("lecture-quiz-body");

    if (!body) {
      return;
    }

    body.textContent = "";

    const status = document.createElement("div");
    status.className = "lecture-quiz-status";
    status.textContent = text;

    body.appendChild(status);
  },

  /**
   * Fetch the lecture's practice topics and render them as choices.
   */
  loadQuizTopics(): void {
    Controller.setQuizStatus("טוען נושאים...");

    chrome.runtime.sendMessage(
      { type: "QUIZ_TOPICS" },
      (response: QuizTopicsResponse) => {
        if (chrome.runtime.lastError) {
          Controller.setQuizStatus("שגיאת תקשורת, אנא נסה שוב.");
          return;
        }

        if (!response?.ok) {
          Controller.setQuizStatus(
            response?.error || "שגיאה בטעינת הנושאים."
          );
          return;
        }

        if (!response.enoughContent || !response.topics?.length) {
          Controller.setQuizStatus(
            "עדיין לא הצטבר מספיק תוכן מההרצאה כדי לתרגל. נסה שוב מאוחר יותר."
          );
          return;
        }

        Controller.renderQuizTopics(response.topics);
      }
    );
  },

  /**
   * Render the topic list. Topic text comes from the model, so it is inserted
   * with textContent only.
   */
  renderQuizTopics(topics: string[]): void {
    const body = document.getElementById("lecture-quiz-body");

    if (!body) {
      return;
    }

    body.textContent = "";

    const heading = document.createElement("h3");
    heading.className = "lecture-quiz-heading";
    heading.textContent = "בחר נושא לתרגול";
    body.appendChild(heading);

    for (const topic of topics) {
      const button = document.createElement("button");
      button.className = "lecture-quiz-topic";
      button.textContent = topic;

      button.addEventListener("click", () => {
        activeQuizTopic = topic;
        Controller.loadQuizQuestion(topic);
      });

      body.appendChild(button);
    }
  },

  /**
   * Fetch one question about the chosen topic and render it.
   */
  loadQuizQuestion(topic: string): void {
    Controller.setQuizStatus("מכין שאלה...");

    chrome.runtime.sendMessage(
      { type: "QUIZ_QUESTION", topic },
      (response: QuizQuestionResponse) => {
        if (chrome.runtime.lastError) {
          Controller.setQuizStatus("שגיאת תקשורת, אנא נסה שוב.");
          return;
        }

        if (!response?.ok) {
          Controller.setQuizStatus(
            response?.error || "שגיאה בהכנת השאלה."
          );
          return;
        }

        if (!response.enoughContent || !response.options?.length) {
          Controller.setQuizStatus(
            "לא ניתן להכין שאלה על הנושא הזה כרגע."
          );
          return;
        }

        Controller.renderQuizQuestion(
          response.question || "",
          response.options
        );
      }
    );
  },

  /**
   * Render a question with its four options. All model text is inserted via
   * textContent. The correct answer is already known locally, so checking the
   * answer needs no further server round trip.
   */
  renderQuizQuestion(question: string, options: QuizOption[]): void {
    const body = document.getElementById("lecture-quiz-body");

    if (!body) {
      return;
    }

    body.textContent = "";

    const heading = document.createElement("h3");
    heading.className = "lecture-quiz-heading";
    heading.textContent = question;
    body.appendChild(heading);

    const optionButtons: HTMLButtonElement[] = [];

    options.forEach((option) => {
      const button = document.createElement("button");
      button.className = "lecture-quiz-option";

      const label = document.createElement("div");
      label.textContent = option.text;
      button.appendChild(label);

      button.addEventListener("click", () => {
        Controller.revealQuizAnswer(optionButtons, options, option);
      });

      optionButtons.push(button);
      body.appendChild(button);
    });
  },

  /**
   * Mark the chosen answer, reveal the correct one, and show every
   * explanation. Then offer another question or finishing up.
   */
  revealQuizAnswer(
    optionButtons: HTMLButtonElement[],
    options: QuizOption[],
    chosen: QuizOption
  ): void {
    const body = document.getElementById("lecture-quiz-body");

    if (!body) {
      return;
    }

    optionButtons.forEach((button, index) => {
      const option = options[index];

      button.classList.add("answered");
      button.disabled = true;

      if (option.isCorrect) {
        button.classList.add("correct");
      } else if (option === chosen) {
        button.classList.add("incorrect");
      }

      const explanation = document.createElement("div");
      explanation.className = "lecture-quiz-explanation";
      explanation.textContent = option.explanation;
      button.appendChild(explanation);
    });

    const actions = document.createElement("div");
    actions.className = "lecture-quiz-actions";

    const nextButton = document.createElement("button");
    nextButton.className = "lecture-quiz-btn-primary";
    nextButton.textContent = "שאלה נוספת";

    nextButton.addEventListener("click", () => {
      if (activeQuizTopic) {
        Controller.loadQuizQuestion(activeQuizTopic);
      }
    });

    const finishButton = document.createElement("button");
    finishButton.className = "lecture-quiz-btn-secondary";
    finishButton.textContent = "סיום";

    finishButton.addEventListener("click", () => {
      const overlay = document.getElementById("lecture-quiz-overlay");

      if (overlay) {
        overlay.style.display = "none";
      }
    });

    actions.appendChild(nextButton);
    actions.appendChild(finishButton);
    body.appendChild(actions);

    body.scrollTop = body.scrollHeight;
  },

  addChatMessage(
    text: string,
    sender: "user" | "assistant"
  ): HTMLDivElement | null {
    const messagesContainer = document.getElementById("lecture-chat-messages");

    if (!messagesContainer) {
      return null;
    }

    const message = document.createElement("div");

    message.className = `lecture-chat-message ${sender}`;
    message.textContent = text;

    messagesContainer.appendChild(message);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    return message;
  },

  sendChatMessage(): void {
    const input = document.getElementById(
      "lecture-chat-input"
    ) as HTMLInputElement | null;

    if (!input) {
      return;
    }

    const question = input.value.trim();

    if (!question) {
      return;
    }

    Controller.addChatMessage(question, "user");
    input.value = "";

    const loadingMessage = Controller.addChatMessage("", "assistant");

    if (loadingMessage) {
      loadingMessage.classList.add("lecture-chat-loading-message");
      loadingMessage.innerHTML = `
        <span class="lecture-chat-loading-dots" aria-label="Thinking...">
          <span></span>
          <span></span>
          <span></span>
        </span>
      `;
    }

    chrome.runtime.sendMessage(
      {
        type: "ASK_LECTURE",
        question,
      },
      (response: AskLectureResponse) => {
        if (chrome.runtime.lastError) {
          if (loadingMessage) {
            loadingMessage.classList.remove("lecture-chat-loading-message");
            loadingMessage.textContent = "שגיאת תקשורת, אנא נסה שוב.";
          }

          return;
        }

        if (!response?.ok) {
          if (loadingMessage) {
            loadingMessage.classList.remove("lecture-chat-loading-message");
            loadingMessage.textContent =
              response?.error || "שגיאה בקבלת תשובה מהשרת.";
          }

          return;
        }

        const answer = response.answer || "לא התקבלה תשובה מהשרת.";

        if (loadingMessage) {
          loadingMessage.classList.remove("lecture-chat-loading-message");
          loadingMessage.textContent = answer;
        }

        // Persist the completed exchange so it survives a tab refresh. Only
        // real answers are saved (loading/error messages are not persisted).
        if (response.answer) {
          chrome.runtime.sendMessage(
            {
              type: "SAVE_CHAT_MESSAGE",
              question,
              answer: response.answer,
            },
            () => {
              // Best-effort; read lastError to avoid an unchecked warning.
              void chrome.runtime.lastError;
            }
          );
        }
      }
    );
  },

  async textSummary(summaryButton: HTMLButtonElement): Promise<void> {
    // Disable the button and show a loading indicator
    summaryButton.disabled = true;
    summaryButton.innerHTML =
      '<i class="fa-solid fa-spinner fa-spin fa-2x"></i>';
    summaryButton.title = "Generating summary...";

    try {
      chrome.runtime.sendMessage(
        {
          type: "GENERATE_SUMMARY",
        },
        (response: SummaryResponse) => {
          // Restore the summary button after processing
          summaryButton.disabled = false;
          summaryButton.innerHTML =
            '<i class="fa-solid fa-file-lines fa-2x"></i>';
          summaryButton.title = "Lecture Summary";

          // Check for any runtime errors
          if (chrome.runtime.lastError) {
            alert("Connection error. Please try again.");
            return;
          }

          if (response?.ok) {
            console.log(response.info || "PDF download started");
          } else {
            alert(response?.error || "Error generating summary.");
          }
        }
      );
    } catch {
      summaryButton.disabled = false;
      summaryButton.innerHTML =
        '<i class="fa-solid fa-file-lines fa-2x"></i>';
      summaryButton.title = "Lecture Summary";
      alert("Error generating summary.");
    }
  },

  onClick(): void {
    // Get the buttons by their IDs
    const summaryButton = document.getElementById(
      "summary"
    ) as HTMLButtonElement;

    const askButton = document.getElementById(
      "questions"
    ) as HTMLButtonElement;

    const quizButton = document.getElementById("quiz") as HTMLButtonElement;

    // Add a click event to the buttons
    summaryButton.addEventListener("click", () =>
      Controller.textSummary(summaryButton)
    );

    askButton.addEventListener("click", () => {
      Controller.toggleChatPanel();
    });

    quizButton.addEventListener("click", () => {
      Controller.toggleQuizPanel();
    });
  },
};
