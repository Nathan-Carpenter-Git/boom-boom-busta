import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientMessage, LobbyView, ServerMessage } from "../../shared/protocol";
import { loadSession, saveSession } from "./session";

export type Status = "connecting" | "waking" | "open";

export interface Connection {
  status: Status;
  lobby: LobbyView | null;
  playerId: string | null;
  error: string | null;
  notice: string | null;
  send: (msg: ClientMessage) => void;
  clearError: () => void;
}

// Render's free tier puts the server to sleep after about 15 idle minutes, and the first visit
// after that waits up to a minute for it to boot. Past this delay we tell players it is waking up.
const WAKING_AFTER_MS = 2500;

function socketUrl(): string {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}/ws`;
}

export function useConnection(): Connection {
  const [status, setStatus] = useState<Status>("connecting");
  const [lobby, setLobby] = useState<LobbyView | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let stopped = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let wakingTimer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;

    const connect = () => {
      const ws = new WebSocket(socketUrl());
      wsRef.current = ws;
      wakingTimer = setTimeout(() => setStatus((s) => (s === "open" ? s : "waking")), WAKING_AFTER_MS);

      ws.onopen = () => {
        attempt = 0;
        clearTimeout(wakingTimer);
        setStatus("open");
        const session = loadSession();
        if (session) ws.send(JSON.stringify({ type: "resume", ...session } satisfies ClientMessage));
      };

      ws.onmessage = (event) => {
        const msg: ServerMessage = JSON.parse(event.data);
        switch (msg.type) {
          case "joined":
            saveSession({ code: msg.lobby.code, playerId: msg.playerId, token: msg.token });
            setPlayerId(msg.playerId);
            setLobby(msg.lobby);
            setError(null);
            return;
          case "lobby":
            setLobby(msg.lobby);
            return;
          case "kicked":
            saveSession(null);
            setLobby(null);
            setPlayerId(null);
            setNotice("The host removed you from the lobby.");
            return;
          case "error":
            if (msg.fatal) {
              saveSession(null);
              setLobby(null);
              setPlayerId(null);
              setNotice("That game ended while you were away.");
            } else {
              setError(msg.message);
            }
            return;
        }
      };

      ws.onclose = () => {
        clearTimeout(wakingTimer);
        if (stopped) return;
        setStatus("connecting");
        attempt += 1;
        retryTimer = setTimeout(connect, Math.min(500 * 2 ** attempt, 5000));
      };
    };

    connect();
    // Phones freeze background tabs; reconnect straight away when the player comes back.
    const onVisible = () => {
      if (document.visibilityState === "visible" && wsRef.current?.readyState === WebSocket.CLOSED) {
        clearTimeout(retryTimer);
        connect();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearTimeout(retryTimer);
      clearTimeout(wakingTimer);
      document.removeEventListener("visibilitychange", onVisible);
      wsRef.current?.close();
    };
  }, []);

  const send = useCallback((msg: ClientMessage) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    else setError("Not connected yet, try again in a moment");
    if (msg.type === "leave") {
      saveSession(null);
      setLobby(null);
      setPlayerId(null);
    }
    if (msg.type === "create" || msg.type === "join") setNotice(null);
  }, []);

  const clearError = useCallback(() => setError(null), []);
  return { status, lobby, playerId, error, notice, send, clearError };
}
