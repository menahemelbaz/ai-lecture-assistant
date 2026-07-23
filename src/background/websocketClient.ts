const SERVER_WS_URL = "ws://localhost:3001";

const INITIAL_RECONNECT_DELAY_MS = 1000;
const MAX_RECONNECT_DELAY_MS = 30000;

type TranscriptHandler = (text: string) => Promise<void> | void;

let socket: WebSocket | null = null;
let connecting = false;

// Retains the latest transcript handler across reconnection attempts.
let activeHandler: TranscriptHandler | null = null;

// Prevents reconnection after a deliberate shutdown.
let intentionalClose = false;

let reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

// Cancels any scheduled reconnection attempt.
function clearReconnectTimer(): void {
  if (reconnectTimer !== null) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

// Schedules one reconnection attempt using capped exponential backoff.
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

  reconnectDelay = Math.min(
    reconnectDelay * 2,
    MAX_RECONNECT_DELAY_MS
  );
}

// Opens the socket and registers its lifecycle event handlers.
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

      // Reset the backoff after a successful connection.
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

      // Reconnect only when the connection was not intentionally closed.
      scheduleReconnect();
    };

    socket.onerror = () => {
      // Closing the socket delegates cleanup and reconnection to onclose.
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

// Registers the latest transcript handler and opens or reuses the connection.
export function connectWebSocket(
  onTranscript: TranscriptHandler
): void {
  activeHandler = onTranscript;
  intentionalClose = false;

  openSocket();
}

// Closes the connection and disables all pending reconnection attempts.
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