window.Buttons = {
  addIconsLink(): void {
    // Loads the external stylesheets the extension UI depends on: the Font
    // Awesome icon set and the Rubik font used across all panels. Guarded so
    // repeated activations don't append duplicate <link> tags.
    const stylesheets: { id: string; href: string }[] = [
      {
        id: "lecture-assistant-icons",
        href:
          "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css",
      },
      {
        id: "lecture-assistant-font",
        href:
          "https://fonts.googleapis.com/css2?family=Rubik:wght@400;500;600;700&display=swap",
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

    // Create a container element
    const container: HTMLDivElement = document.createElement("div");

    // Set the container's ID
    container.id = "secondary-buttons";

    // Create the summary button
    const summaryButton: HTMLButtonElement = Buttons.createButton(
      "fa-solid fa-file-lines",
      "3x",
      "buttons",
      "summary",
      "Summarize Lecture"
    );

    // Create the ask button
    const askButton: HTMLButtonElement = Buttons.createButton(
      "fa-solid fa-comment",
      "3x",
      "buttons",
      "questions",
      "Ask about the lecture"
    );

    // Create the quiz button
    const quizButton: HTMLButtonElement = Buttons.createButton(
      "fa-solid fa-list-check",
      "3x",
      "buttons",
      "quiz",
      "Practice Lecture Topics"
    );

    // Add all buttons to the container
    container.appendChild(summaryButton);
    container.appendChild(askButton);
    container.appendChild(quizButton);

    // Create a wrapper element
    const wrapper: HTMLDivElement = document.createElement("div");

    // Set the wrapper's ID
    wrapper.id = "wrapper-main-button";

    // Create the main extension button
    const mainButton: HTMLButtonElement = Buttons.createMainButton();

    // Add the main button to the wrapper
    wrapper.appendChild(mainButton);

    // Add the container to the wrapper
    wrapper.appendChild(container);

    // Insert the wrapper into the page
    document.body.appendChild(wrapper);
  },
};
