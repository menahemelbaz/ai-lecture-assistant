const SERVER_WS_URL = "ws://localhost:3001";

// Reconnection backoff bounds.
const INITIAL_RECONNECT_DELAY_MS = 1000;
const MAX_RECONNECT_DELAY_MS = 30000;

type TranscriptHandler = (text: string) => Promise<void> | void;

let socket: WebSocket | null = null;
let connecting = false;

// The single active transcript handler. Kept at module level so that repeated
// connect calls don't silently discard a newer handler, and so the reconnect
// path can re-attach it without the caller passing it again.
let activeHandler: TranscriptHandler | null = null;

// Set true only for an intentional shutdown, so the close handler knows not to
// schedule a reconnect. This is what stops the socket from "fighting" a
// deliberate disconnect when recording ends.
let intentionalClose = false;

let reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Cancel any pending reconnect attempt.
 */
function clearReconnectTimer(): void {
  if (reconnectTimer !== null) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

/**
 * Schedule a reconnect using exponential backoff, unless the socket was closed
 * intentionally or there is no handler to deliver transcripts to.
 */
function scheduleReconnect(): void {
  if (intentionalClose || activeHandler === null) {
    return;
  }

  if (reconnectTimer !== null) {
    return;
  }

  const delay = reconnectDelay;

  console.warn(`WebSocket disconnected. Reconnecting in ${delay}ms.`);

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    openSocket();
  }, delay);

  // Grow the delay for the next attempt, capped at the maximum.
  reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY_MS);
}

/**
 * Open the underlying socket and wire up its event handlers.
 */
function openSocket(): void {
  if (socket && socket.readyState === WebSocket.OPEN) {
    return;
  }

  if (connecting) {
    return;
  }

  connecting = true;

  try {
    socket = new WebSocket(SERVER_WS_URL);

    socket.onopen = () => {
      console.log("WebSocket is connected");
      connecting = false;

      // A healthy connection resets the backoff for future drops.
      reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
    };

    socket.onmessage = async (message: MessageEvent) => {
      const text =
        typeof message.data === "string"
          ? message.data
          : String(message.data);

      const handler = activeHandler;

      if (!handler) {
        return;
      }

      try {
        await handler(text);
      } catch (err) {
        console.error("Error handling transcript chunk:", err);
      }
    };

    socket.onclose = () => {
      connecting = false;
      socket = null;

      // Unexpected drop: try to recover. Intentional close: stay down.
      scheduleReconnect();
    };

    socket.onerror = () => {
      // Let onclose handle teardown and reconnect scheduling; closing here
      // ensures onclose fires even if the socket got stuck mid-handshake.
      if (socket) {
        try {
          socket.close();
        } catch { }
      }
    };
  } catch {
    connecting = false;
    socket = null;
    scheduleReconnect();
  }
}

/**
 * Connect to the transcription server and register the transcript handler.
 * Safe to call multiple times: the latest handler always wins, and an existing
 * healthy connection is reused rather than duplicated.
 */
export function connectWebSocket(onTranscript: TranscriptHandler): void {
  activeHandler = onTranscript;
  intentionalClose = false;

  openSocket();
}

/**
 * Intentionally close the connection and stop reconnecting.
 * Call this when recording stops, so the socket doesn't linger or auto-revive.
 */
export function disconnectWebSocket(): void {
  intentionalClose = true;
  activeHandler = null;

  clearReconnectTimer();
  reconnectDelay = INITIAL_RECONNECT_DELAY_MS;

  if (socket) {
    try {
      socket.close();
    } catch { }

    socket = null;
  }

  connecting = false;
}
