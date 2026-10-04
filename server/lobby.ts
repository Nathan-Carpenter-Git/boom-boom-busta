import { randomBytes, randomUUID } from "node:crypto";
import { type CardId, cleanSpecials, DEFAULT_SPECIALS, dealCards, SPECIAL_CARDS } from "../shared/cards.js";
import type { GameAction, LobbySettings, LobbyView, ServerMessage } from "../shared/protocol.js";
import { MAX_NAME_LENGTH, MAX_PLAYERS, MIN_PLAYERS, type RoomIndex } from "../shared/rules.js";
import { Game, type GameOptions } from "./game.js";
import { LobbyError, shuffle } from "./util.js";

export { LobbyError, shuffle };

export type Send = (message: ServerMessage) => void;

interface Player {
  id: string;
  token: string;
  name: string;
  send: Send | null;
}

export interface Lobby {
  code: string;
  hostId: string;
  phase: "lobby" | "game";
  players: Player[];
  /** The host's choices, kept from game to game in this lobby. */
  settings: LobbySettings;
  game: Game | null;
}

// No I or O, so codes read cleanly out loud and on a phone screen.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const CODE_LENGTH = 4;

function cleanName(raw: unknown): string {
  const name = typeof raw === "string" ? raw.replace(/\s+/g, " ").trim().slice(0, MAX_NAME_LENGTH) : "";
  if (!name) throw new LobbyError("Pick a name first");
  return name;
}

export class LobbyManager {
  private lobbies = new Map<string, Lobby>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();

  /** `options.timeScale` shortens every game timer (dev and tests); time comes from `Date.now` and `setTimeout`. */
  constructor(
    private readonly minPlayers = MIN_PLAYERS,
    private readonly options: GameOptions = {},
  ) {}

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
    const lobby: Lobby = {
      code,
      hostId: player.id,
      phase: "lobby",
      players: [player],
      settings: { specials: [...DEFAULT_SPECIALS] },
      game: null,
    };
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
      this.stopTimer(lobby);
      this.lobbies.delete(lobby.code);
      return true;
    }
    if (lobby.hostId === playerId) {
      lobby.hostId = (lobby.players.find((p) => p.send) ?? lobby.players[0]).id;
    }
    // Their card stays in play, so the game can still end the way the rules say.
    if (lobby.game) {
      lobby.game.depart(playerId, Date.now());
      this.schedule(lobby);
    }
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

  /** Turns a special card on or off for the next deal; host only, and not mid-game. */
  setSpecial(lobby: Lobby, byId: string, card: CardId, on: boolean): void {
    this.requireHost(lobby, byId);
    if (lobby.phase !== "lobby") throw new LobbyError("Change the cards between games");
    if (!SPECIAL_CARDS.includes(card)) throw new LobbyError("That's not a special card");
    const rest = lobby.settings.specials.filter((id) => id !== card);
    lobby.settings.specials = cleanSpecials(on === true ? [...rest, card] : rest);
  }

  deal(lobby: Lobby, byId: string, random = Math.random): void {
    this.requireHost(lobby, byId);
    if (lobby.phase !== "lobby") throw new LobbyError("Cards are already dealt");
    const count = lobby.players.length;
    if (count < this.minPlayers) throw new LobbyError(`You need at least ${this.minPlayers} players`);
    const deck = shuffle(dealCards(count, lobby.settings.specials, random), random);
    const seating = shuffle(lobby.players, random).map((p, i) => ({
      id: p.id,
      name: p.name,
      ...deck[i],
      room: (i % 2) as RoomIndex,
    }));
    lobby.game = new Game(seating, Date.now(), { random, ...this.options });
    lobby.phase = "game";
    this.schedule(lobby);
  }

  /** A game action from a player; the caller broadcasts afterwards. */
  act(lobby: Lobby, byId: string, action: GameAction): void {
    if (!lobby.game) throw new LobbyError("The game hasn't started");
    if (typeof action !== "object" || action === null) throw new LobbyError("Unknown action");
    lobby.game.act(byId, action, Date.now());
    this.schedule(lobby);
  }

  backToLobby(lobby: Lobby, byId: string): void {
    this.requireHost(lobby, byId);
    this.stopTimer(lobby);
    lobby.phase = "lobby";
    lobby.game = null;
  }

  view(lobby: Lobby, forId: string): LobbyView {
    const now = Date.now();
    const me = lobby.game?.players.find((p) => p.id === forId);
    return {
      code: lobby.code,
      hostId: lobby.hostId,
      phase: lobby.phase,
      minPlayers: this.minPlayers,
      players: lobby.players.map((p) => ({ id: p.id, name: p.name, connected: p.send !== null })),
      settings: { specials: [...lobby.settings.specials] },
      you: me ? { card: me.card, team: me.team, room: me.room } : null,
      game: lobby.game ? lobby.game.view(forId, now) : null,
    };
  }

  broadcast(lobby: Lobby): void {
    for (const p of lobby.players) p.send?.({ type: "lobby", lobby: this.view(lobby, p.id) });
  }

  /** Wakes up when the current game phase ends, moves the game on and tells everyone. */
  private schedule(lobby: Lobby): void {
    this.stopTimer(lobby);
    const endsAt = lobby.game?.endsAt;
    if (endsAt == null) return;
    const timer = setTimeout(
      () => {
        this.timers.delete(lobby.code);
        if (this.lobbies.get(lobby.code) !== lobby || !lobby.game) return;
        if (lobby.game.advance(Date.now())) this.broadcast(lobby);
        this.schedule(lobby);
      },
      Math.max(0, endsAt - Date.now()),
    );
    timer.unref?.();
    this.timers.set(lobby.code, timer);
  }

  private stopTimer(lobby: Lobby): void {
    clearTimeout(this.timers.get(lobby.code));
    this.timers.delete(lobby.code);
  }

  private newPlayer(name: string, send: Send): Player {
    return { id: randomUUID(), token: randomUUID(), name: cleanName(name), send };
  }

  private requireHost(lobby: Lobby, playerId: string): void {
    if (lobby.hostId !== playerId) throw new LobbyError("Only the host can do that");
  }
}
