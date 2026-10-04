import type { CardId } from "./cards.js";
import type { RoomIndex } from "./rules.js";

export interface PlayerView {
  id: string;
  name: string;
  connected: boolean;
}

export interface LobbyView {
  code: string;
  hostId: string;
  phase: "lobby" | "dealt";
  minPlayers: number;
  players: PlayerView[];
  /** Your own card and room once cards are dealt; nobody else's card is ever sent to you. */
  you: { card: CardId; room: RoomIndex } | null;
  /** Which room each player starts in, once dealt. */
  rooms: [string[], string[]] | null;
}

export type ClientMessage =
  | { type: "create"; name: string }
  | { type: "join"; code: string; name: string }
  | { type: "resume"; code: string; playerId: string; token: string }
  | { type: "leave" }
  | { type: "kick"; playerId: string }
  | { type: "deal" }
  | { type: "backToLobby" };

export type ServerMessage =
  | { type: "joined"; playerId: string; token: string; lobby: LobbyView }
  | { type: "lobby"; lobby: LobbyView }
  | { type: "kicked" }
  | { type: "error"; message: string; fatal?: boolean };
