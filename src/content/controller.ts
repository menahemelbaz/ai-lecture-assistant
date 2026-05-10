window.Controller = {
  async textSummary(summaryButton: HTMLButtonElement): Promise<void> {
    // Disable the button and show a loading indicator
    summaryButton.disabled = true;
    summaryButton.innerHTML =
      '<i class="fa-solid fa-spinner fa-spin fa-2x"></i>';
    summaryButton.title = "מעבד סיכום...";

    try {
      chrome.runtime.sendMessage(
        {
          type: "GENERATE_SUMMARY",
        },
        (response: SummaryResponse) => {
          // Restore the summary button after processing
          summaryButton.disabled = false;
          summaryButton.innerHTML =
            '<i class="fa-solid fa-file-lines fa-2x"></i>';
          summaryButton.title = "סיכום הרצאה";

          // Check for any runtime errors
          if (chrome.runtime.lastError) {
            alert("התרחשה שגיאת תקשורת, אנא נסה שוב");
            return;
          }

          if (response?.ok) {
            console.log(response.info || "PDF download started");
          } else {
            alert(response?.error || "שגיאה ביצירת קובץ PDF");
          }
        }
      );
    } catch {
      summaryButton.disabled = false;
      summaryButton.innerHTML =
        '<i class="fa-solid fa-file-lines fa-2x"></i>';
      summaryButton.title = "סיכום הרצאה";
      alert("שגיאה ביצירת הסיכום");
    }
  },

  onClick(): void {
    // Get the buttons by their IDs
    const summaryButton = document.getElementById("summary") as HTMLButtonElement;
    const askButton = document.getElementById("questions") as HTMLButtonElement;
    const quizButton = document.getElementById("quiz") as HTMLButtonElement;

    // Add a click event to the buttons
    summaryButton.addEventListener("click", () =>
      Controller.textSummary(summaryButton)
    );
    askButton.addEventListener("click", () => {});
    quizButton.addEventListener("click", () => {});
  },
};