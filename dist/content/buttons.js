"use strict";
const FLOATING_BUTTON_MARGIN = 12;
const MAIN_BUTTON_DRAG_THRESHOLD = 6;
const SECONDARY_BUTTONS_SPAN = 228;
let floatingButtonGlobalListenersAttached = false;
function placeFloatingButton(wrapper, left, top) {
    const maxLeft = Math.max(FLOATING_BUTTON_MARGIN, window.innerWidth - wrapper.offsetWidth - FLOATING_BUTTON_MARGIN);
    const maxTop = Math.max(FLOATING_BUTTON_MARGIN, window.innerHeight - wrapper.offsetHeight - FLOATING_BUTTON_MARGIN);
    wrapper.style.left = `${Math.min(Math.max(left, FLOATING_BUTTON_MARGIN), maxLeft)}px`;
    wrapper.style.top = `${Math.min(Math.max(top, FLOATING_BUTTON_MARGIN), maxTop)}px`;
    wrapper.style.right = "auto";
    wrapper.style.bottom = "auto";
}
function updateSecondaryButtonsDirection(wrapper) {
    const rect = wrapper.getBoundingClientRect();
    const availableAbove = rect.bottom - FLOATING_BUTTON_MARGIN;
    const availableBelow = window.innerHeight - rect.top - FLOATING_BUTTON_MARGIN;
    const openUp = availableAbove >= SECONDARY_BUTTONS_SPAN ||
        availableAbove >= availableBelow;
    wrapper.classList.toggle("menu-up", openUp);
    wrapper.classList.toggle("menu-down", !openUp);
}
function attachFloatingButtonGlobalListeners() {
    if (floatingButtonGlobalListenersAttached) {
        return;
    }
    floatingButtonGlobalListenersAttached = true;
    document.addEventListener("pointerdown", (event) => {
        const wrapper = document.getElementById("wrapper-main-button");
        const target = event.target;
        if (wrapper && target && !wrapper.contains(target)) {
            Buttons.closeSecondaryButtons();
        }
    }, true);
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            Buttons.closeSecondaryButtons();
        }
    });
    window.addEventListener("resize", () => {
        const wrapper = document.getElementById("wrapper-main-button");
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
function setupMainButtonInteraction(wrapper, mainButton) {
    let pointerId = null;
    let startX = 0;
    let startY = 0;
    let offsetX = 0;
    let offsetY = 0;
    let dragged = false;
    let suppressClick = false;
    mainButton.addEventListener("pointerdown", (event) => {
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
    mainButton.addEventListener("pointermove", (event) => {
        if (event.pointerId !== pointerId) {
            return;
        }
        if (!dragged &&
            Math.hypot(event.clientX - startX, event.clientY - startY) <
                MAIN_BUTTON_DRAG_THRESHOLD) {
            return;
        }
        dragged = true;
        wrapper.classList.add("is-dragging");
        event.preventDefault();
        placeFloatingButton(wrapper, event.clientX - offsetX, event.clientY - offsetY);
    });
    const finishDrag = (event) => {
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
    mainButton.addEventListener("dragstart", (event) => {
        event.preventDefault();
    });
    mainButton.addEventListener("click", (event) => {
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
    addIconsLink() {
        // Loads each external UI stylesheet once to prevent duplicate link elements.
        const stylesheets = [
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
            const link = document.createElement("link");
            link.id = sheet.id;
            link.rel = "stylesheet";
            link.href = sheet.href;
            document.head.appendChild(link);
        }
    },
    createButton(iconClass, iconSize, className, id = "", title = "") {
        const button = document.createElement("button");
        button.type = "button";
        button.innerHTML = `<i class="${iconClass} fa-${iconSize}"></i>`;
        button.className = className;
        button.id = id;
        button.title = title;
        return button;
    },
    createMainButton() {
        const mainButton = document.createElement("button");
        mainButton.type = "button";
        mainButton.className = "main-button";
        mainButton.title = "AI Lecture Assistant";
        mainButton.setAttribute("aria-controls", "secondary-buttons");
        mainButton.setAttribute("aria-expanded", "false");
        const mainLogo = document.createElement("img");
        mainLogo.src = chrome.runtime.getURL("images/logo.png");
        mainLogo.alt = "AI Lecture Assistant";
        mainLogo.className = "main-button-logo";
        mainLogo.draggable = false;
        mainButton.appendChild(mainLogo);
        return mainButton;
    },
    createButtons() {
        Buttons.addIconsLink();
        // Groups the secondary actions so the overlay can reveal them together.
        const container = document.createElement("div");
        container.id = "secondary-buttons";
        container.setAttribute("aria-hidden", "true");
        const summaryButton = Buttons.createButton("fa-solid fa-file-lines", "3x", "lecture-action-button", "summary", "Summarize Lecture");
        const askButton = Buttons.createButton("fa-solid fa-comment", "3x", "lecture-action-button", "questions", "Ask about the lecture");
        const quizButton = Buttons.createButton("fa-solid fa-list-check", "3x", "lecture-action-button", "quiz", "Practice Lecture Topics");
        container.appendChild(summaryButton);
        container.appendChild(askButton);
        container.appendChild(quizButton);
        // The wrapper combines the main trigger and secondary actions for hover behavior.
        const wrapper = document.createElement("div");
        wrapper.id = "wrapper-main-button";
        const mainButton = Buttons.createMainButton();
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
    toggleSecondaryButtons() {
        const wrapper = document.getElementById("wrapper-main-button");
        const mainButton = wrapper?.querySelector(".main-button");
        const container = document.getElementById("secondary-buttons");
        if (!wrapper || !mainButton || !container) {
            return;
        }
        const willOpen = !wrapper.classList.contains("is-open");
        wrapper.classList.toggle("is-open", willOpen);
        mainButton.setAttribute("aria-expanded", String(willOpen));
        container.setAttribute("aria-hidden", String(!willOpen));
    },
    closeSecondaryButtons() {
        const wrapper = document.getElementById("wrapper-main-button");
        const mainButton = wrapper?.querySelector(".main-button");
        const container = document.getElementById("secondary-buttons");
        if (!wrapper || !mainButton || !container) {
            return;
        }
        wrapper.classList.remove("is-open");
        mainButton.setAttribute("aria-expanded", "false");
        container.setAttribute("aria-hidden", "true");
    },
};
