import type { CardId, Team } from "./cards.js";
import type { RoomIndex } from "./rules.js";

export interface PlayerView {
  id: string;
  name: string;
  connected: boolean;
}

export type ShareKind = "color" | "card";
export type WinningTeam = "red" | "blue";

/** Something you learned about another player. `card` is only present when you saw their whole card. */
export interface KnownInfo {
  id: string;
  team: Team;
  card?: CardId;
  via: "color share" | "card share" | "public reveal";
}

export interface ShareRequest {
  id: string;
  from: string;
  to: string;
  kind: ShareKind;
}

export interface GamePlayerView {
  id: string;
  name: string;
  room: RoomIndex;
  /** Left the game for good; their card stays in play and they can still be sent as a hostage. */
  gone: boolean;
}

export interface RoomView {
  leader: string | null;
  players: string[];
}

export interface ResultsView {
  winner: WinningTeam;
  /** Every player's card, revealed at the end. */
  cards: { id: string; card: CardId }[];
  bookie: { id: string; call: WinningTeam | null; won: boolean } | null;
}

export interface GameView {
  phase: "vote" | "round" | "moving" | "results";
  /** Zero based index into `rounds`. */
  round: number;
  rounds: { seconds: number; hostages: number }[];
  /** Server clock time when the current phase ends, and the server clock when this view was built. */
  endsAt: number | null;
  serverNow: number;
  players: GamePlayerView[];
  rooms: [RoomView, RoomView];
  /** Leader votes in your room: voter id to the player they back. */
  votes: Record<string, string>;
  /** Your room leader's current hostage picks. */
  hostages: string[];
  /** Share requests you sent or received. */
  requests: ShareRequest[];
  known: KnownInfo[];
  /** Only sent to the Bookie, until the results. */
  bookieCall: WinningTeam | null;
  /** During the moving screen: who arrived in each room in the exchange that just happened. */
  moved: [string[], string[]] | null;
  results: ResultsView | null;
}

export interface LobbyView {
  code: string;
  hostId: string;
  phase: "lobby" | "game";
  minPlayers: number;
  players: PlayerView[];
  /** Your own card and current room once cards are dealt; nobody else's card is sent unless you earned it. */
  you: { card: CardId; room: RoomIndex } | null;
  game: GameView | null;
}

export type GameAction =
  | { type: "vote"; for: string | null }
  | { type: "requestShare"; to: string; kind: ShareKind }
  | { type: "answerShare"; requestId: string; accept: boolean }
  | { type: "cancelShare"; requestId: string }
  | { type: "reveal" }
  | { type: "pickHostage"; playerId: string }
  | { type: "bookieCall"; team: WinningTeam };

export type ClientMessage =
  | { type: "create"; name: string }
  | { type: "join"; code: string; name: string }
  | { type: "resume"; code: string; playerId: string; token: string }
  | { type: "leave" }
  | { type: "kick"; playerId: string }
  | { type: "deal" }
  | { type: "act"; action: GameAction }
  | { type: "backToLobby" };

export type ServerMessage =
  | { type: "joined"; playerId: string; token: string; lobby: LobbyView }
  | { type: "lobby"; lobby: LobbyView }
  | { type: "kicked" }
  | { type: "error"; message: string; fatal?: boolean };
