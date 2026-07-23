// Global declarations for cross-file access in content scripts

interface Window {
  Buttons: {
    addIconsLink(): void;
    createButton(
      iconClass: string,
      iconSize: string,
      className: string,
      id?: string,
      title?: string
    ): HTMLButtonElement;
    createButtons(): void;
    createMainButton(): HTMLButtonElement;
  };

  Controller: {
    textSummary(summaryButton: HTMLButtonElement): Promise<void>;
    createChat(): HTMLDivElement;
    toggleChatPanel(): void;
    addChatMessage(
      text: string,
      sender: "user" | "assistant"
    ): HTMLDivElement | null;
    sendChatMessage(): void;
    onClick(): void;
    createQuizPanel(): HTMLDivElement;
    toggleQuizPanel(): void;
    restoreChatHistory(): void;
    setQuizStatus(text: string): void;
    loadQuizTopics(): void;
    renderQuizTopics(topics: string[]): void;
    loadQuizQuestion(topic: string): void;
    renderQuizQuestion(question: string, options: QuizOption[]): void;
    revealQuizAnswer(
      optionButtons: HTMLButtonElement[],
      options: QuizOption[],
      chosen: QuizOption
    ): void;
  };

  Manager: {
    setupExtension(): Promise<void>;
    markVideoAsUserStarted(video: HTMLVideoElement): void;
    startRecordingOnPlay(video: HTMLVideoElement): void;
    stopRecordingOnPause(video: HTMLVideoElement): void;
  };

  ContentUI: {
    showExtensionButtons(): void;
    hideExtensionButtons(): void;
    hasVideo(): boolean;
  };
}

declare var Buttons: Window["Buttons"];
declare var Controller: Window["Controller"];
declare var Manager: Window["Manager"];
declare var ContentUI: Window["ContentUI"];
