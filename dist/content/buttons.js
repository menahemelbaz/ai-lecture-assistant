"use strict";
window.Buttons = {
    addIconsLink() {
        const icons = document.createElement("link");
        icons.rel = "stylesheet";
        icons.href =
            "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css";
        document.head.appendChild(icons);
    },
    createButton(iconClass, iconSize, className, id = "", title = "") {
        const button = document.createElement("button");
        button.innerHTML = `<i class="${iconClass} fa-${iconSize}"></i>`;
        button.className = className;
        button.id = id;
        button.title = title;
        return button;
    },
    createMainButton() {
        const mainButton = document.createElement("button");
        mainButton.className = "main-button";
        mainButton.title = "AI Lecture Assistant";
        const mainLogo = document.createElement("img");
        mainLogo.src = chrome.runtime.getURL("images/logo.png");
        mainLogo.alt = "AI Lecture Assistant";
        mainLogo.className = "main-button-logo";
        mainButton.appendChild(mainLogo);
        return mainButton;
    },
    createButtons() {
        Buttons.addIconsLink();
        // Create a container element
        const container = document.createElement("div");
        // Set the container's ID
        container.id = "secondary-buttons";
        // Create the summary button
        const summaryButton = Buttons.createButton("fa-solid fa-file-lines", "3x", "buttons", "summary", "Summarize Lecture");
        // Create the ask button
        const askButton = Buttons.createButton("fa-solid fa-comment", "3x", "buttons", "questions", "Ask about the lecture");
        // Create the quiz button
        const quizButton = Buttons.createButton("fa-solid fa-list-check", "3x", "buttons", "quiz", "Practice Lecture Topics");
        // Add all buttons to the container
        container.appendChild(summaryButton);
        container.appendChild(askButton);
        container.appendChild(quizButton);
        // Create a wrapper element
        const wrapper = document.createElement("div");
        // Set the wrapper's ID
        wrapper.id = "wrapper-main-button";
        // Create the main extension button
        const mainButton = Buttons.createMainButton();
        // Add the main button to the wrapper
        wrapper.appendChild(mainButton);
        // Add the container to the wrapper
        wrapper.appendChild(container);
        // Insert the wrapper into the page
        document.body.appendChild(wrapper);
    },
};
