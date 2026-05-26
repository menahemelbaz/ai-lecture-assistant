let socket: WebSocket | null = null;
let connecting = false;

type TranscriptHandler = (text: string) => Promise<void> | void;

/**
 * Open a WebSocket connection to the local transcription server.
 */
export function connectWebSocket(onTranscript: TranscriptHandler): void {
  if (socket && socket.readyState === WebSocket.OPEN) return;
  if (connecting) return;

  connecting = true;

  try {
    socket = new WebSocket("ws://localhost:3001");

    socket.onopen = () => {
      console.log("WebSocket is connected");
      connecting = false;
    };

    socket.onmessage = async (message: MessageEvent) => {
      const text =
        typeof message.data === "string"
          ? message.data
          : String(message.data);

      try {
        await onTranscript(text);
      } catch (err) {
        console.error("Error handling transcript chunk:", err);
      }
    };

    socket.onclose = () => {
      connecting = false;
      socket = null;
    };

    socket.onerror = (_err: Event) => {
      connecting = false;

      if (socket) {
        try {
          socket.close();
        } catch {}

        socket = null;
      }
    };
  } catch {
    connecting = false;
    socket = null;
  }
}
