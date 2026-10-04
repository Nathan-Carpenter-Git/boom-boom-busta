import { randomBytes, randomUUID } from "node:crypto";
import { buildDeck, type CardId } from "../shared/cards.js";
import type { LobbyView, ServerMessage } from "../shared/protocol.js";
import { MAX_NAME_LENGTH, MAX_PLAYERS, MIN_PLAYERS, type RoomIndex } from "../shared/rules.js";

export type Send = (message: ServerMessage) => void;

export class LobbyError extends Error {}

interface Player {
  id: string;
  token: string;
  name: string;
  send: Send | null;
  card: CardId | null;
  room: RoomIndex | null;
}

export interface Lobby {
  code: string;
  hostId: string;
  phase: "lobby" | "dealt";
  players: Player[];
}

// No I or O, so codes read cleanly out loud and on a phone screen.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const CODE_LENGTH = 4;

export function shuffle<T>(items: T[], random = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function cleanName(raw: unknown): string {
  const name = typeof raw === "string" ? raw.replace(/\s+/g, " ").trim().slice(0, MAX_NAME_LENGTH) : "";
  if (!name) throw new LobbyError("Pick a name first");
  return name;
}

export class LobbyManager {
  private lobbies = new Map<string, Lobby>();

  constructor(private readonly minPlayers = MIN_PLAYERS) {}

  get lobbyCount(): number {
    return this.lobbies.size;
  }

  getLobby(code: string): Lobby | undefined {
    return this.lobbies.get(code.toUpperCase());
  }

  create(name: string, send: Send) {
    let code: string;
    do {
      code = Array.from(randomBytes(CODE_LENGTH), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
    } while (this.lobbies.has(code));
    const player = this.newPlayer(name, send);
    const lobby: Lobby = { code, hostId: player.id, phase: "lobby", players: [player] };
    this.lobbies.set(code, lobby);
    return { lobby, player };
  }

  join(code: string, name: string, send: Send) {
    const lobby = this.getLobby(String(code ?? "").trim());
    if (!lobby) throw new LobbyError("No lobby with that code");
    if (lobby.phase !== "lobby") throw new LobbyError("That game has already started");
    if (lobby.players.length >= MAX_PLAYERS) throw new LobbyError("That lobby is full");
    const clean = cleanName(name);
    if (lobby.players.some((p) => p.name.toLowerCase() === clean.toLowerCase())) {
      throw new LobbyError("Someone in that lobby already has that name");
    }
    const player = this.newPlayer(clean, send);
    lobby.players.push(player);
    return { lobby, player };
  }

  /** Reattach a returning player (reload, locked phone, network drop) to their seat. */
  resume(code: string, playerId: string, token: string, send: Send) {
    const lobby = this.getLobby(String(code ?? ""));
    const player = lobby?.players.find((p) => p.id === playerId && p.token === token);
    if (!lobby || !player) throw new LobbyError("That game is gone");
    player.send = send;
    return { lobby, player };
  }

  disconnect(lobby: Lobby, playerId: string, send: Send): boolean {
    const player = lobby.players.find((p) => p.id === playerId);
    // A stale socket closing after the player already resumed on a new one changes nothing.
    if (!player || player.send !== send) return false;
    player.send = null;
    return true;
  }

  /** Removes a player; returns true when that emptied and deleted the lobby. */
  remove(lobby: Lobby, playerId: string): boolean {
    lobby.players = lobby.players.filter((p) => p.id !== playerId);
    if (lobby.players.length === 0) {
      this.lobbies.delete(lobby.code);
      return true;
    }
    if (lobby.hostId === playerId) {
      lobby.hostId = (lobby.players.find((p) => p.send) ?? lobby.players[0]).id;
    }
    if (lobby.phase === "dealt") this.backToLobby(lobby, lobby.hostId);
    return false;
  }

  kick(lobby: Lobby, byId: string, targetId: string): Player {
    this.requireHost(lobby, byId);
    if (targetId === byId) throw new LobbyError("You can't kick yourself");
    const target = lobby.players.find((p) => p.id === targetId);
    if (!target) throw new LobbyError("That player already left");
    this.remove(lobby, targetId);
    return target;
  }

  deal(lobby: Lobby, byId: string, random = Math.random): void {
    this.requireHost(lobby, byId);
    if (lobby.phase !== "lobby") throw new LobbyError("Cards are already dealt");
    const count = lobby.players.length;
    if (count < this.minPlayers) throw new LobbyError(`You need at least ${this.minPlayers} players`);
    const deck = shuffle(buildDeck(count), random);
    const seating = shuffle(lobby.players, random);
    seating.forEach((player, i) => {
      player.card = deck[i];
      player.room = (i % 2) as RoomIndex;
    });
    lobby.phase = "dealt";
  }

  backToLobby(lobby: Lobby, byId: string): void {
    this.requireHost(lobby, byId);
    lobby.phase = "lobby";
    for (const p of lobby.players) {
      p.card = null;
      p.room = null;
    }
  }

  view(lobby: Lobby, forId: string): LobbyView {
    const me = lobby.players.find((p) => p.id === forId);
    const dealt = lobby.phase === "dealt";
    const roomOf = (room: RoomIndex) => lobby.players.filter((p) => p.room === room).map((p) => p.id);
    return {
      code: lobby.code,
      hostId: lobby.hostId,
      phase: lobby.phase,
      minPlayers: this.minPlayers,
      players: lobby.players.map((p) => ({ id: p.id, name: p.name, connected: p.send !== null })),
      you: dealt && me?.card && me.room !== null ? { card: me.card, room: me.room } : null,
      rooms: dealt ? [roomOf(0), roomOf(1)] : null,
    };
  }

  broadcast(lobby: Lobby): void {
    for (const p of lobby.players) p.send?.({ type: "lobby", lobby: this.view(lobby, p.id) });
  }

  private newPlayer(name: string, send: Send): Player {
    return { id: randomUUID(), token: randomUUID(), name: cleanName(name), send, card: null, room: null };
  }

  private requireHost(lobby: Lobby, playerId: string): void {
    if (lobby.hostId !== playerId) throw new LobbyError("Only the host can do that");
  }
}
