window.Buttons = {
  addIconsLink(): void {
    // Loads each external UI stylesheet once to prevent duplicate link elements.
    const stylesheets: { id: string; href: string }[] = [
      {
        id: "lecture-assistant-icons",
        href: "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css",
      },
      {
        id: "lecture-assistant-font",
        href: "https://fonts.googleapis.com/css2?family=Rubik:wght@400;500;600;700&display=swap",
      },
    ];

    for (const sheet of stylesheets) {
      if (document.getElementById(sheet.id)) {
        continue;
      }

      const link: HTMLLinkElement = document.createElement("link");

      link.id = sheet.id;
      link.rel = "stylesheet";
      link.href = sheet.href;

      document.head.appendChild(link);
    }
  },

  createButton(
    iconClass: string,
    iconSize: string,
    className: string,
    id: string = "",
    title: string = ""
  ): HTMLButtonElement {
    const button: HTMLButtonElement = document.createElement("button");

    button.innerHTML = `<i class="${iconClass} fa-${iconSize}"></i>`;
    button.className = className;
    button.id = id;
    button.title = title;

    return button;
  },

  createMainButton(): HTMLButtonElement {
    const mainButton: HTMLButtonElement = document.createElement("button");

    mainButton.className = "main-button";
    mainButton.title = "AI Lecture Assistant";

    const mainLogo: HTMLImageElement = document.createElement("img");

    mainLogo.src = chrome.runtime.getURL("images/logo.png");
    mainLogo.alt = "AI Lecture Assistant";
    mainLogo.className = "main-button-logo";

    mainButton.appendChild(mainLogo);

    return mainButton;
  },

  createButtons(): void {
    Buttons.addIconsLink();

    // Groups the secondary actions so the overlay can reveal them together.
    const container: HTMLDivElement = document.createElement("div");

    container.id = "secondary-buttons";

    const summaryButton: HTMLButtonElement = Buttons.createButton(
      "fa-solid fa-file-lines",
      "3x",
      "lecture-action-button",
      "summary",
      "Summarize Lecture"
    );

    const askButton: HTMLButtonElement = Buttons.createButton(
      "fa-solid fa-comment",
      "3x",
      "lecture-action-button",
      "questions",
      "Ask about the lecture"
    );

    const quizButton: HTMLButtonElement = Buttons.createButton(
      "fa-solid fa-list-check",
      "3x",
      "lecture-action-button",
      "quiz",
      "Practice Lecture Topics"
    );

    container.appendChild(summaryButton);
    container.appendChild(askButton);
    container.appendChild(quizButton);

    // The wrapper combines the main trigger and secondary actions for hover behavior.
    const wrapper: HTMLDivElement = document.createElement("div");

    wrapper.id = "wrapper-main-button";

    const mainButton: HTMLButtonElement = Buttons.createMainButton();

    wrapper.appendChild(mainButton);
    wrapper.appendChild(container);

    document.body.appendChild(wrapper);
  },
};