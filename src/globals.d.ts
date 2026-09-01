// Global type declarations for objects shared across content-script files.

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
    createChat(): HTMLDivElement;
    restoreChatHistory(): void;
    toggleChatPanel(): void;
    createQuizPanel(): HTMLDivElement;
    toggleQuizPanel(): void;
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
    renderMathInto(target: HTMLElement, raw: string): void;
    addChatMessage(
      text: string,
      sender: "user" | "assistant"
    ): HTMLDivElement | null;
    sendChatMessage(): void;
    textSummary(summaryButton: HTMLButtonElement): Promise<void>;
    printSummaryHtml(html: string): void;
    onClick(): void;
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
    showCaptureError(message: string): void;
  };
}

declare var Buttons: Window["Buttons"];
declare var Controller: Window["Controller"];
declare var Manager: Window["Manager"];
declare var ContentUI: Window["ContentUI"];