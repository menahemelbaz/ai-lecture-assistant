const TRANSCRIPT_STORAGE_KEY = "transcriptChunks";
const ACTIVE_TAB_STORAGE_KEY = "activeTranscriptTabId";

let transcriptChunks: string[] = [];
let activeTabId: number | null = null;

/**
 * Load the saved transcript state from local storage.
 */
async function loadTranscriptState(): Promise<void> {
  try {
    const result = await chrome.storage.local.get([
      TRANSCRIPT_STORAGE_KEY,
      ACTIVE_TAB_STORAGE_KEY,
    ]);

    const storedChunks = result[TRANSCRIPT_STORAGE_KEY];
    const storedTabId = result[ACTIVE_TAB_STORAGE_KEY];

    if (Array.isArray(storedChunks)) {
      transcriptChunks = storedChunks.filter(
        (item: unknown): item is string => typeof item === "string"
      );
    } else {
      transcriptChunks = [];
    }

    activeTabId = typeof storedTabId === "number" ? storedTabId : null;
  } catch (err) {
    console.error("Error loading transcript state:", err);
    transcriptChunks = [];
    activeTabId = null;
  }
}

/**
 * Save the current transcript state to local storage.
 */
async function saveTranscriptState(): Promise<void> {
  try {
    await chrome.storage.local.set({
      [TRANSCRIPT_STORAGE_KEY]: transcriptChunks,
      [ACTIVE_TAB_STORAGE_KEY]: activeTabId,
    });
  } catch (err) {
    console.error("Error saving transcript state:", err);
  }
}

/**
 * Clear the current transcript from memory and local storage.
 */
async function clearTranscript(): Promise<void> {
  transcriptChunks = [];
  await saveTranscriptState();
}

/**
 * Set the current active tab and persist it.
 */
async function setActiveTab(tabId: number | null): Promise<void> {
  activeTabId = tabId;
  await saveTranscriptState();
}

/**
 * Start a new transcript session for a specific tab.
 */
async function startNewTranscriptSession(tabId: number): Promise<void> {
  await setActiveTab(tabId);
  await clearTranscript();
}

/**
 * Add a new chunk of transcript to memory and persist it.
 */
async function appendTranscript(text: string): Promise<void> {
  const trimmedText = text.trim();

  if (!trimmedText) {
    return;
  }

  transcriptChunks.push(trimmedText);
  await saveTranscriptState();
}

/**
 * Return the full transcript as a single string.
 */
async function getFullTranscript(): Promise<string> {
  if (transcriptChunks.length === 0) {
    await loadTranscriptState();
  }

  return transcriptChunks.join(" ").trim();
}

/**
 * Return the active tab id for the current transcript session.
 */
function getActiveTabId(): number | null {
  return activeTabId;
}

export const TranscriptStore = {
  loadTranscriptState,
  saveTranscriptState,
  clearTranscript,
  setActiveTab,
  startNewTranscriptSession,
  appendTranscript,
  getFullTranscript,
  getActiveTabId,
};
