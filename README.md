## System Flow

- The extension detects a video element on the current page.

- After detecting a video, the extension injects a floating UI into the page, including buttons for summary generation and lecture Q&A.

- Before recording starts, the user must click the Chrome extension icon. This action arms the current tab for audio capture using `chrome.tabCapture`, but recording does not start yet.

- When the user presses Play on the video, the content script sends a message to the background service worker.

- The background service worker verifies that the current tab was armed, then sends a message to the offscreen document to start audio capture.

- The offscreen document captures the tab audio stream, processes it with the Web Audio API, splits it into short WAV chunks, and sends each chunk to the local Node.js server using `POST /stream`.

- The server receives each audio chunk, saves it temporarily, sends it to OpenAI Whisper for transcription, deletes the temporary audio file, and sends the transcribed text back to the extension using WebSocket.

- The background service worker stores the accumulated transcript in memory and in `chrome.storage.local`.

- When the user clicks the summary button, the extension sends the accumulated transcript to the server using `POST /summarize`.

- The server generates a structured summary, creates a PDF file, and returns a download URL to the extension.

- When the user asks a question in the chat, the extension sends the question and the current transcript to the server using `POST /ask`.

- The server generates an answer based first on the lecture transcript. If the transcript does not contain enough information, it clearly states that and may provide a general explanation.

### Main Flow

`Video detected → Tab armed → Play pressed → Audio captured → Chunks sent to server → Transcription returned → Transcript stored → Summary or Q&A generated`