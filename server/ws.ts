import type { WebSocket, WebSocketServer } from "ws";
import type { ClientMessage, ServerMessage } from "../shared/protocol.js";
import { type Lobby, LobbyError, type LobbyManager, type Send } from "./lobby.js";

// Render's free tier proxy closes WebSockets that stay silent for a while, and phones drop
// sockets without a clean close. Pinging keeps live sockets open and finds dead ones.
const HEARTBEAT_MS = 25_000;
// How long a dropped player keeps their seat (locked phone, reload, flaky mobile data).
const RECONNECT_GRACE_MS = Number(process.env.RECONNECT_GRACE_MS ?? 3 * 60_000);

interface Seat {
  code: string;
  playerId: string;
  send: Send;
}

export function attachWs(wss: WebSocketServer, lobbies: LobbyManager, graceMs = RECONNECT_GRACE_MS): void {
  const seats = new WeakMap<WebSocket, Seat>();
  const removals = new Map<string, ReturnType<typeof setTimeout>>();
  const alive = new WeakSet<WebSocket>();

  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!alive.has(ws)) {
        ws.terminate();
        continue;
      }
      alive.delete(ws);
      ws.ping();
    }
  }, HEARTBEAT_MS);
  wss.on("close", () => clearInterval(heartbeat));

  const cancelRemoval = (code: string, playerId: string) => {
    const key = `${code}:${playerId}`;
    clearTimeout(removals.get(key));
    removals.delete(key);
  };

  const leave = (ws: WebSocket) => {
    const seat = seats.get(ws);
    if (!seat) return;
    seats.delete(ws);
    cancelRemoval(seat.code, seat.playerId);
    const lobby = lobbies.getLobby(seat.code);
    if (lobby && !lobbies.remove(lobby, seat.playerId)) lobbies.broadcast(lobby);
  };

  const seated = (ws: WebSocket): { lobby: Lobby; seat: Seat } => {
    const seat = seats.get(ws);
    const lobby = seat && lobbies.getLobby(seat.code);
    if (!seat || !lobby) throw new LobbyError("You're not in a lobby");
    return { lobby, seat };
  };

  const handle = (ws: WebSocket, send: Send, msg: ClientMessage) => {
    switch (msg.type) {
      case "create":
      case "join": {
        leave(ws);
        const { lobby, player } =
          msg.type === "create" ? lobbies.create(msg.name, send) : lobbies.join(msg.code, msg.name, send);
        seats.set(ws, { code: lobby.code, playerId: player.id, send });
        send({ type: "joined", playerId: player.id, token: player.token, lobby: lobbies.view(lobby, player.id) });
        lobbies.broadcast(lobby);
        return;
      }
      case "resume": {
        leave(ws);
        const { lobby, player } = lobbies.resume(msg.code, msg.playerId, msg.token, send);
        seats.set(ws, { code: lobby.code, playerId: player.id, send });
        cancelRemoval(lobby.code, player.id);
        send({ type: "joined", playerId: player.id, token: player.token, lobby: lobbies.view(lobby, player.id) });
        lobbies.broadcast(lobby);
        return;
      }
      case "leave":
        leave(ws);
        return;
      case "kick": {
        const { lobby, seat } = seated(ws);
        const target = lobbies.kick(lobby, seat.playerId, msg.playerId);
        cancelRemoval(lobby.code, target.id);
        target.send?.({ type: "kicked" });
        lobbies.broadcast(lobby);
        return;
      }
      case "setSpecial": {
        const { lobby, seat } = seated(ws);
        lobbies.setSpecial(lobby, seat.playerId, msg.card, msg.on);
        lobbies.broadcast(lobby);
        return;
      }
      case "deal": {
        const { lobby, seat } = seated(ws);
        lobbies.deal(lobby, seat.playerId);
        lobbies.broadcast(lobby);
        return;
      }
      case "act": {
        const { lobby, seat } = seated(ws);
        lobbies.act(lobby, seat.playerId, msg.action);
        lobbies.broadcast(lobby);
        return;
      }
      case "backToLobby": {
        const { lobby, seat } = seated(ws);
        lobbies.backToLobby(lobby, seat.playerId);
        lobbies.broadcast(lobby);
        return;
      }
      default:
        throw new LobbyError("Unknown message");
    }
  };

  wss.on("connection", (ws) => {
    alive.add(ws);
    ws.on("pong", () => alive.add(ws));
    const send: Send = (message: ServerMessage) => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
    };

    ws.on("message", (raw) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        send({ type: "error", message: "Malformed message" });
        return;
      }
      try {
        handle(ws, send, msg);
      } catch (err) {
        if (!(err instanceof LobbyError)) console.error(err);
        // A failed resume means the saved seat is gone, so the client should drop it.
        send({
          type: "error",
          message: err instanceof LobbyError ? err.message : "Something went wrong",
          fatal: msg.type === "resume",
        });
      }
    });

    ws.on("close", () => {
      const seat = seats.get(ws);
      if (!seat) return;
      seats.delete(ws);
      const lobby = lobbies.getLobby(seat.code);
      if (!lobby || !lobbies.disconnect(lobby, seat.playerId, seat.send)) return;
      lobbies.broadcast(lobby);
      cancelRemoval(seat.code, seat.playerId);
      removals.set(
        `${seat.code}:${seat.playerId}`,
        setTimeout(() => {
          removals.delete(`${seat.code}:${seat.playerId}`);
          const still = lobbies.getLobby(seat.code);
          if (still && !lobbies.remove(still, seat.playerId)) lobbies.broadcast(still);
        }, graceMs),
      );
    });
  });
}
