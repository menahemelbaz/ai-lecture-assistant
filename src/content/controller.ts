// Preserves the selected quiz topic between consecutive questions.
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

    // Restore saved messages after the chat panel is created.
    Controller.restoreChatHistory();

    return panel;
  },

  // Restores saved exchanges once per panel to prevent duplicate messages.
  restoreChatHistory(): void {
    const messagesContainer = document.getElementById(
      "lecture-chat-messages"
    );

    if (!messagesContainer) {
      return;
    }

    // The data flag prevents duplicate rendering during repeated panel access.
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
          // Reuse the textContent-based renderer to keep restored content XSS-safe.
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

    // Only static markup is assigned with innerHTML; generated quiz content is
    // inserted later through textContent and createElement to remain XSS-safe.
    const overlay = document.createElement("div");
    overlay.id = "lecture-quiz-overlay";

    overlay.innerHTML = `
      <div id="lecture-quiz-modal">
        <div id="lecture-quiz-header">
          <span id="lecture-quiz-title">Practice Lecture Topics</span>
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

    // Both the close button and backdrop dismiss the quiz.
    closeButton.addEventListener("click", () => {
      overlay.style.display = "none";
    });

    overlay.addEventListener("click", () => {
      overlay.style.display = "none";
    });

    // Prevent clicks inside the modal from reaching the backdrop handler.
    modal.addEventListener("click", (event: MouseEvent) => {
      event.stopPropagation();
    });

    return overlay;
  },

  toggleQuizPanel(): void {
    const overlay = Controller.createQuizPanel();

    if (overlay.style.display === "none" || overlay.style.display === "") {
      overlay.style.display = "flex";

      // Reopening the quiz starts a new topic-selection flow.
      activeQuizTopic = null;
      Controller.loadQuizTopics();

      return;
    }

    overlay.style.display = "none";
  },

  // Replaces the quiz content with a single status message.
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

  // Requests practice topics derived from the active lecture transcript.
  loadQuizTopics(): void {
    Controller.setQuizStatus("Loading topics...");

    chrome.runtime.sendMessage(
      { type: "QUIZ_TOPICS" },
      (response: QuizTopicsResponse) => {
        if (chrome.runtime.lastError) {
          Controller.setQuizStatus("Connection error. Please try again.");
          return;
        }

        if (!response?.ok) {
          Controller.setQuizStatus(
            response?.error || "Error loading topics."
          );
          return;
        }

        if (!response.enoughContent || !response.topics?.length) {
          Controller.setQuizStatus(
            "There is not enough lecture content to practice yet. Please try again later."
          );
          return;
        }

        Controller.renderQuizTopics(response.topics);
      }
    );
  },

  // Renders model-generated topic text through textContent to remain XSS-safe.
  renderQuizTopics(topics: string[]): void {
    const body = document.getElementById("lecture-quiz-body");

    if (!body) {
      return;
    }

    body.textContent = "";

    const heading = document.createElement("h3");
    heading.className = "lecture-quiz-heading";
    heading.textContent = "Choose a topic to practice";
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

  // Requests and renders one question for the selected topic.
  loadQuizQuestion(topic: string): void {
    Controller.setQuizStatus("Preparing question...");

    chrome.runtime.sendMessage(
      { type: "QUIZ_QUESTION", topic },
      (response: QuizQuestionResponse) => {
        if (chrome.runtime.lastError) {
          Controller.setQuizStatus("Connection error. Please try again.");
          return;
        }

        if (!response?.ok) {
          Controller.setQuizStatus(
            response?.error || "Error preparing the question."
          );
          return;
        }

        if (!response.enoughContent || !response.options?.length) {
          Controller.setQuizStatus(
            "A question cannot be prepared for this topic right now."
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

  // Renders model-generated question content through textContent. Answer
  // validation remains local because each option already includes correctness.
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

  // Locks the options, reveals the result and explanations, and displays the
  // available follow-up actions.
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
    nextButton.textContent = "Another Question";

    nextButton.addEventListener("click", () => {
      if (activeQuizTopic) {
        Controller.loadQuizQuestion(activeQuizTopic);
      }
    });

    const finishButton = document.createElement("button");
    finishButton.className = "lecture-quiz-btn-secondary";
    finishButton.textContent = "Finish";

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
            loadingMessage.textContent = "Connection error. Please try again.";
          }

          return;
        }

        if (!response?.ok) {
          if (loadingMessage) {
            loadingMessage.classList.remove("lecture-chat-loading-message");
            loadingMessage.textContent =
              response?.error || "Error receiving a response from the server.";
          }

          return;
        }

        const answer =
          response.answer || "No response was received from the server.";

        if (loadingMessage) {
          loadingMessage.classList.remove("lecture-chat-loading-message");
          loadingMessage.textContent = answer;
        }

        // Persist only completed exchanges so chat history survives a refresh.
        if (response.answer) {
          chrome.runtime.sendMessage(
            {
              type: "SAVE_CHAT_MESSAGE",
              question,
              answer: response.answer,
            },
            () => {
              // Read lastError to prevent an unchecked runtime warning.
              void chrome.runtime.lastError;
            }
          );
        }
      }
    );
  },

  async textSummary(summaryButton: HTMLButtonElement): Promise<void> {
    // Prevent duplicate requests while the summary is being generated.
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
          // Restore the button before handling the response result.
          summaryButton.disabled = false;
          summaryButton.innerHTML =
            '<i class="fa-solid fa-file-lines fa-2x"></i>';
          summaryButton.title = "Lecture Summary";

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
    // Bind each extension action to its corresponding control.
    const summaryButton = document.getElementById(
      "summary"
    ) as HTMLButtonElement;

    const askButton = document.getElementById(
      "questions"
    ) as HTMLButtonElement;

    const quizButton = document.getElementById("quiz") as HTMLButtonElement;

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