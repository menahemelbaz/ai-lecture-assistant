# AI Lecture Assistant

## Project overview

This repository contains a client-only Chrome extension.

The browser extension is located mainly under `src/`. There is no backend
server: all AI features call the OpenAI API directly using the user's personal
API key, which is stored in Chrome extension storage.

## Browser extension structure

- `manifest.json` — extension configuration, permissions and entry points
- `src/background.ts` — background service worker entry point
- `src/background/` — background-related modules, including the OpenAI clients
  (chat, ask, quiz, summary), transcript storage, and recording control
- `src/config/` — the OpenAI REST client and API-key access
- `src/content/` — scripts injected into web pages
- `offscreen.html` — offscreen document HTML entry point
- `src/offscreen.ts` — offscreen document TypeScript entry point
- `src/offscreen/` — offscreen-related modules, including audio capture and
  direct Whisper transcription
- `src/options/` — extension settings interface (API key management)
- `src/types.ts` — shared TypeScript types
- `scripts/copy-assets.mjs` — copies static assets (.html, .css) into `dist/`
- `style/` — stylesheets
- `assets/` and `images/` — static assets
- `dist/` — generated build output; never edit directly

## API and data handling

- AI transcription, chat, quiz, and summary requests go directly from the
  extension to the OpenAI API.
- The user's OpenAI API key is read only through `src/background/apiKeyStore.ts`.
  The offscreen document requests it from the background rather than reading
  storage directly.
- The API key is never exposed to content scripts or to the web page.

## Security rules

- Never commit API keys, tokens, passwords or user data.
- Do not add browser permissions without explaining why.
- Never expose the user's API key to content scripts or page context.
- Treat the transcript and generated summaries as private user data.

## Development rules

- Edit source files, not `dist/`.
- Reuse shared types when possible.
- Do not add dependencies without explaining the need.
- Preserve Manifest V3 compatibility.
- Run TypeScript checking and the production build after changes.
- When changing communication between the extension contexts (content,
  background, offscreen), inspect every side of the flow.

## Before making changes

1. Read `manifest.json`.
2. Read the root `package.json`.
3. Inspect the relevant `src` directories.
4. Explain the current execution and data flow.
5. List the files that need to change.
6. Identify possible side effects.
7. Wait for approval before implementing broad architectural changes.