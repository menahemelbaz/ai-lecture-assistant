# AI Lecture Assistant

AI Lecture Assistant is a Chrome extension that helps students learn from recorded lectures by capturing lecture audio, transcribing it, generating summaries, and allowing users to ask questions about the lecture content.

## Features

* Detects video elements on web pages
* Captures tab audio using Chrome `tabCapture`
* Sends audio chunks to a local Node.js server for transcription
* Stores the accumulated transcript locally in the extension
* Generates a structured lecture summary as a PDF
* Provides an "Ask the Lecture" chat based on the transcript
* Supports play, pause, and resume during lecture viewing

## How It Works

1. The extension detects a video on the current page and injects a floating UI.
2. The user clicks the extension icon to arm the current tab for audio capture.
3. When the user plays the video, the extension starts capturing the tab audio.
4. The offscreen document processes the audio, splits it into WAV chunks, and sends them to the server.
5. The server transcribes each chunk and sends the transcript back to the extension using WebSocket.
6. The accumulated transcript is used for summary generation and lecture Q&A.

## Architecture

The project is split into a Chrome extension and a local Node.js server.

### Chrome Extension

* `content/` - Detects videos and manages the page UI
* `background/` - Manages recording flow, transcript state, summary requests, and lecture questions
* `offscreen/` - Captures and processes tab audio

### Server

* `routes/` - Handles API endpoints
* `services/` - Contains transcription, summary, Q&A, and PDF logic
* `config/` - Stores external service configuration
* `utils/` - Contains helper functions

## Tech Stack

* TypeScript
* Chrome Extension Manifest V3
* Chrome `tabCapture`
* Offscreen Documents
* Web Audio API
* Node.js
* Express.js
* WebSocket
* OpenAI Whisper
* OpenAI Chat API
* Puppeteer

## Main API Routes

* `POST /stream` - Receives audio chunks and returns transcription
* `POST /summarize` - Generates a lecture summary and PDF
* `POST /ask` - Answers questions based on the lecture transcript

## Data Handling

* Audio chunks are stored temporarily on the server and deleted after transcription.
* The transcript is stored locally in the extension using memory and `chrome.storage.local`.
* Generated PDF files are stored temporarily and deleted automatically.
* The server does not permanently store lecture transcripts.

## Status

This project is currently a working prototype and personal learning project.

Future improvements may include stronger session management, OCR support for slides or boards, semantic search over transcript chunks, user authentication, and production deployment.
