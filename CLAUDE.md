# AI Lecture Assistant

## Project overview

This repository contains a browser extension and a Node.js backend.

The browser extension is located mainly under `src/`.
The backend is located under `server/`.

## Browser extension structure

- `manifest.json` — extension configuration, permissions and entry points
- `src/background.ts` — background service worker entry point
- `src/background/` — background-related modules
- `src/content/` — scripts injected into web pages
- `offscreen.html` — offscreen document HTML entry point
- `src/offscreen.ts` — offscreen document TypeScript entry point
- `src/offscreen/` — offscreen-related modules
- `src/options/` — extension settings interface
- `src/types.ts` — shared TypeScript types
- `style/` — stylesheets
- `assets/` and `images/` — static assets
- `dist/` — generated build output; never edit directly

## Backend structure

- `server/server.js` — backend entry point
- `server/routes/` — HTTP API route definitions
- `server/services/` — business logic and external integrations
- `server/config/` — backend configuration
- `server/utils/` — reusable server utilities
- `server/uploads/` — runtime user uploads; do not commit or edit
- `server/generated-pdfs/` — generated runtime files; do not commit
- `server/.env` — private secrets; never read, expose or commit
- `server/.env.example` — environment variable documentation without secrets

## Security rules

- Never expose values from `.env` in client-side code.
- Never commit API keys, tokens, passwords or user data.
- Do not add browser permissions without explaining why.
- Treat uploaded files and generated PDFs as private data.
- Validate data received by backend routes.
- Do not hard-code private backend credentials in the extension.

## Development rules

- Edit source files, not `dist/`.
- Reuse shared types when possible.
- Do not add dependencies without explaining the need.
- Preserve Manifest V3 compatibility.
- Run TypeScript checking and the production build after changes.
- Before changing communication between the extension and server,
  inspect both the client request and the matching backend route.

## Before making changes

1. Read `manifest.json`.
2. Read the root `package.json`.
3. Read `server/package.json`.
4. Inspect the relevant `src` directories.
5. Inspect `server/routes` and matching `server/services`.
6. Explain the current execution and data flow.
7. List the files that need to change.
8. Wait for approval before implementing broad architectural changes.