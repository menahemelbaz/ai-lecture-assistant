"use strict";
window.Controller = {
    createChat() {
        const existingPanel = document.getElementById("lecture-chat-panel");
        if (existingPanel) {
            return existingPanel;
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
        const closeButton = document.getElementById("lecture-chat-close");
        const sendButton = document.getElementById("lecture-chat-send");
        const input = document.getElementById("lecture-chat-input");
        closeButton.addEventListener("click", () => {
            panel.style.display = "none";
        });
        sendButton.addEventListener("click", () => {
            Controller.sendChatMessage();
        });
        input.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
                Controller.sendChatMessage();
            }
        });
        return panel;
    },
    toggleChatPanel() {
        const panel = Controller.createChat();
        if (panel.style.display === "none" || panel.style.display === "") {
            panel.style.display = "flex";
            return;
        }
        panel.style.display = "none";
    },
    addChatMessage(text, sender) {
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
    sendChatMessage() {
        const input = document.getElementById("lecture-chat-input");
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
        chrome.runtime.sendMessage({
            type: "ASK_LECTURE",
            question,
        }, (response) => {
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
            if (loadingMessage) {
                loadingMessage.classList.remove("lecture-chat-loading-message");
                loadingMessage.textContent =
                    response.answer || "לא התקבלה תשובה מהשרת.";
            }
        });
    },
    async textSummary(summaryButton) {
        // Disable the button and show a loading indicator
        summaryButton.disabled = true;
        summaryButton.innerHTML =
            '<i class="fa-solid fa-spinner fa-spin fa-2x"></i>';
        summaryButton.title = "Generating summary...";
        try {
            chrome.runtime.sendMessage({
                type: "GENERATE_SUMMARY",
            }, (response) => {
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
                }
                else {
                    alert(response?.error || "Error generating summary.");
                }
            });
        }
        catch {
            summaryButton.disabled = false;
            summaryButton.innerHTML =
                '<i class="fa-solid fa-file-lines fa-2x"></i>';
            summaryButton.title = "Lecture Summary";
            alert("Error generating summary.");
        }
    },
    onClick() {
        // Get the buttons by their IDs
        const summaryButton = document.getElementById("summary");
        const askButton = document.getElementById("questions");
        const quizButton = document.getElementById("quiz");
        // Add a click event to the buttons
        summaryButton.addEventListener("click", () => Controller.textSummary(summaryButton));
        askButton.addEventListener("click", () => {
            Controller.toggleChatPanel();
        });
        quizButton.addEventListener("click", () => { });
    },
};
