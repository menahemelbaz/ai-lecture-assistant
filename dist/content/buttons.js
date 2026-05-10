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
    createButtons() {
        Buttons.addIconsLink();
        // Create a container element
        const container = document.createElement("div");
        // Set the container's ID
        container.id = "secondary-buttons";
        // Create the summary button
        const summaryButton = Buttons.createButton("fa-solid fa-file-lines", "2x", "buttons", "summary", "Summarize lecture");
        // Create the ask button
        const askButton = Buttons.createButton("fa-solid fa-comment", "2x", "buttons", "questions", "Ask about lecture");
        // Create the quiz button
        const quizButton = Buttons.createButton("fa-solid fa-list-check", "2x", "buttons", "quiz", "Practice lecture topics");
        // Add all buttons to the container
        container.appendChild(summaryButton);
        container.appendChild(askButton);
        container.appendChild(quizButton);
        // Create a wrapper element
        const wrapper = document.createElement("div");
        // Set the wrapper's ID
        wrapper.id = "wrapper-main-button";
        // Create the main settings button
        const mainButton = Buttons.createButton("fa-solid fa-gear", "3x", "main-button");
        // Add the main button to the wrapper
        wrapper.appendChild(mainButton);
        // Add the container to the wrapper
        wrapper.appendChild(container);
        // Insert the wrapper into the page
        document.body.appendChild(wrapper);
    },
};
