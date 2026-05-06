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
  };
  Controller: {
    textSummary(summaryButton: HTMLButtonElement): Promise<void>;
    onClick(): void;
  };
  Manager: {
    setupExtension(): Promise<void>;
    startRecordingOnPlay(video: HTMLVideoElement): void;
    stopRecordingOnPause(video: HTMLVideoElement): void;
  };
}

declare var Buttons: Window["Buttons"];
declare var Controller: Window["Controller"];
declare var Manager: Window["Manager"];