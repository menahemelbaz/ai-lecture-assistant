const FLOATING_BUTTON_MARGIN = 12;
const MAIN_BUTTON_DRAG_THRESHOLD = 6;
const SECONDARY_BUTTONS_SPAN = 228;

let floatingButtonGlobalListenersAttached = false;

function placeFloatingButton(
  wrapper: HTMLDivElement,
  left: number,
  top: number
): void {
  const maxLeft = Math.max(
    FLOATING_BUTTON_MARGIN,
    window.innerWidth - wrapper.offsetWidth - FLOATING_BUTTON_MARGIN
  );
  const maxTop = Math.max(
    FLOATING_BUTTON_MARGIN,
    window.innerHeight - wrapper.offsetHeight - FLOATING_BUTTON_MARGIN
  );

  wrapper.style.left = `${Math.min(
    Math.max(left, FLOATING_BUTTON_MARGIN),
    maxLeft
  )}px`;
  wrapper.style.top = `${Math.min(
    Math.max(top, FLOATING_BUTTON_MARGIN),
    maxTop
  )}px`;
  wrapper.style.right = "auto";
  wrapper.style.bottom = "auto";
}

function updateSecondaryButtonsDirection(wrapper: HTMLDivElement): void {
  const rect = wrapper.getBoundingClientRect();
  const availableAbove = rect.bottom - FLOATING_BUTTON_MARGIN;
  const availableBelow =
    window.innerHeight - rect.top - FLOATING_BUTTON_MARGIN;
  const openUp =
    availableAbove >= SECONDARY_BUTTONS_SPAN ||
    availableAbove >= availableBelow;

  wrapper.classList.toggle("menu-up", openUp);
  wrapper.classList.toggle("menu-down", !openUp);
}

function attachFloatingButtonGlobalListeners(): void {
  if (floatingButtonGlobalListenersAttached) {
    return;
  }

  floatingButtonGlobalListenersAttached = true;

  document.addEventListener(
    "pointerdown",
    (event: PointerEvent) => {
      const wrapper = document.getElementById("wrapper-main-button");
      const target = event.target as Node | null;

      if (wrapper && target && !wrapper.contains(target)) {
        Buttons.closeSecondaryButtons();
      }
    },
    true
  );

  document.addEventListener("keydown", (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      Buttons.closeSecondaryButtons();
    }
  });

  window.addEventListener("resize", () => {
    const wrapper = document.getElementById(
      "wrapper-main-button"
    ) as HTMLDivElement | null;

    if (wrapper) {
      const rect = wrapper.getBoundingClientRect();
      placeFloatingButton(wrapper, rect.left, rect.top);
      updateSecondaryButtonsDirection(wrapper);
    }

    if (typeof Controller !== "undefined") {
      Controller.keepChatPanelInsideViewport();
    }
  });
}

function setupMainButtonInteraction(
  wrapper: HTMLDivElement,
  mainButton: HTMLButtonElement
): void {
  let pointerId: number | null = null;
  let startX = 0;
  let startY = 0;
  let offsetX = 0;
  let offsetY = 0;
  let dragged = false;
  let suppressClick = false;

  mainButton.addEventListener("pointerdown", (event: PointerEvent) => {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();

    const rect = wrapper.getBoundingClientRect();

    pointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    offsetX = event.clientX - rect.left;
    offsetY = event.clientY - rect.top;
    dragged = false;

    mainButton.setPointerCapture(event.pointerId);
  });

  mainButton.addEventListener("pointermove", (event: PointerEvent) => {
    if (event.pointerId !== pointerId) {
      return;
    }

    if (
      !dragged &&
      Math.hypot(event.clientX - startX, event.clientY - startY) <
      MAIN_BUTTON_DRAG_THRESHOLD
    ) {
      return;
    }

    dragged = true;
    wrapper.classList.add("is-dragging");
    event.preventDefault();

    placeFloatingButton(
      wrapper,
      event.clientX - offsetX,
      event.clientY - offsetY
    );
  });

  const finishDrag = (event: PointerEvent): void => {
    if (event.pointerId !== pointerId) {
      return;
    }

    if (mainButton.hasPointerCapture(event.pointerId)) {
      mainButton.releasePointerCapture(event.pointerId);
    }

    wrapper.classList.remove("is-dragging");

    if (dragged) {
      suppressClick = true;
      window.setTimeout(() => {
        suppressClick = false;
      }, 0);

      updateSecondaryButtonsDirection(wrapper);

      if (typeof Controller !== "undefined") {
        Controller.repositionChatPanelNearMainButton();
      }
    }

    pointerId = null;
    dragged = false;
  };

  mainButton.addEventListener("pointerup", finishDrag);
  mainButton.addEventListener("pointercancel", finishDrag);
  mainButton.addEventListener("dragstart", (event: DragEvent) => {
    event.preventDefault();
  });

  mainButton.addEventListener("click", (event: MouseEvent) => {
    if (suppressClick) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    updateSecondaryButtonsDirection(wrapper);
    Buttons.toggleSecondaryButtons();
  });
}

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

    button.type = "button";
    button.innerHTML = `<i class="${iconClass} fa-${iconSize}"></i>`;
    button.className = className;
    button.id = id;
    button.title = title;

    return button;
  },

  createMainButton(): HTMLButtonElement {
    const mainButton: HTMLButtonElement = document.createElement("button");

    mainButton.type = "button";
    mainButton.className = "main-button";
    mainButton.title = "AI Lecture Assistant";
    mainButton.setAttribute("aria-controls", "secondary-buttons");
    mainButton.setAttribute("aria-expanded", "false");

    const mainLogo: HTMLImageElement = document.createElement("img");

    mainLogo.src = chrome.runtime.getURL("images/logo.png");
    mainLogo.alt = "AI Lecture Assistant";
    mainLogo.className = "main-button-logo";
    mainLogo.draggable = false;

    mainButton.appendChild(mainLogo);

    return mainButton;
  },

  createButtons(): void {
    Buttons.addIconsLink();

    // Groups the secondary actions so the overlay can reveal them together.
    const container: HTMLDivElement = document.createElement("div");

    container.id = "secondary-buttons";
    container.setAttribute("aria-hidden", "true");

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

    // Restores the original hover-out behavior after the menu was opened by click.
    wrapper.addEventListener("mouseleave", () => {
      Buttons.closeSecondaryButtons();
    });

    document.body.appendChild(wrapper);

    setupMainButtonInteraction(wrapper, mainButton);
    attachFloatingButtonGlobalListeners();
    updateSecondaryButtonsDirection(wrapper);
  },

  toggleSecondaryButtons(): void {
    const wrapper = document.getElementById("wrapper-main-button");
    const mainButton = wrapper?.querySelector<HTMLButtonElement>(".main-button");
    const container = document.getElementById("secondary-buttons");

    if (!wrapper || !mainButton || !container) {
      return;
    }

    const willOpen = !wrapper.classList.contains("is-open");

    wrapper.classList.toggle("is-open", willOpen);
    mainButton.setAttribute("aria-expanded", String(willOpen));
    container.setAttribute("aria-hidden", String(!willOpen));
  },

  closeSecondaryButtons(): void {
    const wrapper = document.getElementById("wrapper-main-button");
    const mainButton = wrapper?.querySelector<HTMLButtonElement>(".main-button");
    const container = document.getElementById("secondary-buttons");

    if (!wrapper || !mainButton || !container) {
      return;
    }

    wrapper.classList.remove("is-open");
    mainButton.setAttribute("aria-expanded", "false");
    container.setAttribute("aria-hidden", "true");
  },
};
