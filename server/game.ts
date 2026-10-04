import type { CardId, Team } from "../shared/cards.js";
import type {
  GameAction,
  GameView,
  KnownInfo,
  ResultsView,
  ShareKind,
  ShareRequest,
  WinningTeam,
} from "../shared/protocol.js";
import { type RoomIndex, roundPlan } from "../shared/rules.js";
import { LobbyError, shuffle } from "./util.js";

// One game, from the leader vote to the results. Pure logic: callers pass the time in, and the
// lobby manager schedules `advance` for `endsAt`, so tests can run whole games with fake time.

export const VOTE_SECONDS = 60;
export const MOVING_SECONDS = 10;

export interface GamePlayer {
  id: string;
  name: string;
  card: CardId;
  /** The team this player's card plays for, set at the deal. */
  team: Team;
  room: RoomIndex;
  /** Who this player backs as their room's leader. */
  vote: string | null;
  /** Left the game for good: the card stays in play, but they no longer vote or share. */
  gone: boolean;
  /** What this player has seen of other players' cards, by player id. */
  knows: Map<string, KnownInfo["via"]>;
}

export interface Seat {
  id: string;
  name: string;
  card: CardId;
  team: Team;
  room: RoomIndex;
}

export interface GameOptions {
  /** Multiplies every timer, so dev and tests can play short games (for example 0.1). */
  timeScale?: number;
  random?: () => number;
}

const other = (room: RoomIndex): RoomIndex => (room === 0 ? 1 : 0);

export class Game {
  phase: GameView["phase"] = "vote";
  round = 0;
  endsAt: number | null;
  readonly players: GamePlayer[];
  readonly leaders: [string | null, string | null] = [null, null];
  /** Each room leader's current hostage picks. */
  hostages: [string[], string[]] = [[], []];
  requests: ShareRequest[] = [];
  bookieCall: WinningTeam | null = null;
  /** Who arrived in each room in the last exchange. */
  moved: [string[], string[]] | null = null;
  results: ResultsView | null = null;
  readonly plan: { seconds: number; hostages: number }[];
  private readonly scale: number;
  private readonly random: () => number;
  private nextRequest = 1;

  constructor(seats: Seat[], now: number, options: GameOptions = {}) {
    this.scale = options.timeScale ?? 1;
    this.random = options.random ?? Math.random;
    this.players = seats.map((s) => ({ ...s, vote: null, gone: false, knows: new Map() }));
    this.plan = roundPlan(seats.length).map((r) => ({ seconds: r.minutes * 60 * this.scale, hostages: r.hostages }));
    this.endsAt = now + VOTE_SECONDS * 1000 * this.scale;
  }

  player(id: string): GamePlayer {
    const p = this.players.find((q) => q.id === id);
    if (!p) throw new LobbyError("That player is not in this game");
    return p;
  }

  inRoom(room: RoomIndex): GamePlayer[] {
    return this.players.filter((p) => p.room === room);
  }

  get lastRound(): boolean {
    return this.round === this.plan.length - 1;
  }

  act(playerId: string, action: GameAction, now: number): void {
    const me = this.player(playerId);
    if (me.gone) throw new LobbyError("You left this game");
    switch (action.type) {
      case "vote":
        return this.vote(me, action.for, now);
      case "requestShare":
        return this.requestShare(me, action.to, action.kind);
      case "answerShare":
        return this.answerShare(me, action.requestId, action.accept);
      case "cancelShare":
        this.requests = this.requests.filter((r) => !(r.id === action.requestId && r.from === me.id));
        return;
      case "reveal":
        return this.reveal(me);
      case "pickHostage":
        return this.pickHostage(me, action.playerId);
      case "bookieCall":
        return this.callWinner(me, action.team);
      default:
        throw new LobbyError("Unknown action");
    }
  }

  /** Runs every phase change due by `now`; returns whether anything changed. */
  advance(now: number): boolean {
    let changed = false;
    while (this.endsAt !== null && now >= this.endsAt) {
      changed = true;
      this.timeUp(this.endsAt);
    }
    return changed;
  }

  /** A player left for good (kicked, or gone past the reconnect grace). */
  depart(playerId: string, now: number): void {
    const p = this.players.find((q) => q.id === playerId);
    if (!p || p.gone) return;
    p.gone = true;
    p.vote = null;
    for (const q of this.players) if (q.vote === p.id) q.vote = null;
    this.requests = this.requests.filter((r) => r.from !== p.id && r.to !== p.id);
    // A leader who leaves is replaced by a fresh vote in their room.
    if (this.leaders[p.room] === p.id) this.leaders[p.room] = null;
    this.checkLeader(0, now);
    this.checkLeader(1, now);
  }

  view(forId: string, now: number): GameView {
    const me = this.players.find((p) => p.id === forId);
    const votes: Record<string, string> = {};
    if (me) for (const p of this.inRoom(me.room)) if (p.vote) votes[p.id] = p.vote;
    const known: KnownInfo[] = me
      ? [...me.knows].map(([id, via]) => {
          const { card, team } = this.player(id);
          return via === "color share" ? { id, team, via } : { id, team, card, via };
        })
      : [];
    return {
      phase: this.phase,
      round: this.round,
      rounds: this.plan,
      endsAt: this.endsAt,
      serverNow: now,
      players: this.players.map((p) => ({ id: p.id, name: p.name, room: p.room, gone: p.gone })),
      rooms: [0, 1].map((room) => ({
        leader: this.leaders[room],
        players: this.inRoom(room as RoomIndex).map((p) => p.id),
      })) as GameView["rooms"],
      votes,
      hostages: me ? [...this.hostages[me.room]] : [],
      requests: this.requests.filter((r) => r.from === forId || r.to === forId),
      known,
      bookieCall: me?.card === "bookie" || this.phase === "results" ? this.bookieCall : null,
      moved: this.phase === "moving" ? this.moved : null,
      results: this.results,
    };
  }

  private requireTalking(): void {
    if (this.phase !== "vote" && this.phase !== "round") throw new LobbyError("Wait for the next round");
  }

  private roommate(me: GamePlayer, id: string): GamePlayer {
    const p = this.players.find((q) => q.id === id);
    if (!p || p.room !== me.room) throw new LobbyError("They're not in your room");
    return p;
  }

  private vote(me: GamePlayer, forId: string | null, now: number): void {
    this.requireTalking();
    if (forId !== null && this.roommate(me, forId).gone) throw new LobbyError("They left the game");
    me.vote = forId;
    this.checkLeader(me.room, now);
  }

  /** Makes whoever holds a majority of the room's votes its leader, then starts round 1 once both rooms have one. */
  private checkLeader(room: RoomIndex, now: number): void {
    const voters = this.inRoom(room).filter((p) => !p.gone);
    const tally = new Map<string, number>();
    for (const p of voters) {
      if (p.vote && this.player(p.vote).room === room) tally.set(p.vote, (tally.get(p.vote) ?? 0) + 1);
    }
    for (const [id, count] of tally) {
      if (count * 2 > voters.length && this.leaders[room] !== id) this.setLeader(room, id);
    }
    if (this.phase === "vote" && this.leaders[0] && this.leaders[1]) this.startRound(now);
  }

  private setLeader(room: RoomIndex, id: string): void {
    this.leaders[room] = id;
    this.hostages[room] = this.hostages[room].filter((h) => h !== id);
  }

  /** For a room still without a leader when time runs out: the most votes wins, ties at random. */
  private electTopVoted(room: RoomIndex): void {
    if (this.leaders[room]) return;
    const candidates = this.inRoom(room).filter((p) => !p.gone);
    if (candidates.length === 0) return;
    const votes = (id: string) => candidates.filter((p) => p.vote === id).length;
    const top = Math.max(...candidates.map((c) => votes(c.id)));
    const tied = candidates.filter((c) => votes(c.id) === top);
    this.setLeader(room, tied[Math.floor(this.random() * tied.length)].id);
  }

  private requestShare(me: GamePlayer, to: string, kind: ShareKind): void {
    this.requireTalking();
    if (kind !== "color" && kind !== "card") throw new LobbyError("Unknown share");
    if (to === me.id) throw new LobbyError("You can't share with yourself");
    if (this.roommate(me, to).gone) throw new LobbyError("They left the game");
    if (this.requests.some((r) => r.from === me.id && r.to === to && r.kind === kind)) {
      throw new LobbyError("You already asked them");
    }
    this.requests.push({ id: String(this.nextRequest++), from: me.id, to, kind });
  }

  private answerShare(me: GamePlayer, requestId: string, accept: boolean): void {
    const request = this.requests.find((r) => r.id === requestId && r.to === me.id);
    if (!request) throw new LobbyError("That request is gone");
    this.requests = this.requests.filter((r) => r !== request);
    if (!accept) return;
    this.requireTalking();
    const from = this.roommate(me, request.from);
    const via = request.kind === "color" ? "color share" : "card share";
    this.learn(me, from, via);
    this.learn(from, me, via);
  }

  private reveal(me: GamePlayer): void {
    this.requireTalking();
    for (const p of this.inRoom(me.room)) if (p !== me) this.learn(p, me, "public reveal");
  }

  private learn(viewer: GamePlayer, target: GamePlayer, via: KnownInfo["via"]): void {
    // Seeing the whole card beats seeing the color; never downgrade.
    const had = viewer.knows.get(target.id);
    if (had && had !== "color share") return;
    if (had === "color share" && via === "color share") return;
    viewer.knows.set(target.id, via);
  }

  private pickHostage(me: GamePlayer, id: string): void {
    if (this.phase !== "round") throw new LobbyError("Hostages are picked during a round");
    if (this.leaders[me.room] !== me.id) throw new LobbyError("Only the leader picks hostages");
    const target = this.roommate(me, id);
    if (target.id === me.id) throw new LobbyError("Leaders can't be sent");
    const picks = this.hostages[me.room];
    if (picks.includes(id)) {
      this.hostages[me.room] = picks.filter((h) => h !== id);
      return;
    }
    // Picking past the limit swaps out the oldest pick, so a one hostage round is a single tap.
    const limit = this.plan[this.round].hostages;
    this.hostages[me.room] = [...picks, id].slice(-limit);
  }

  private callWinner(me: GamePlayer, team: WinningTeam): void {
    if (me.card !== "bookie") throw new LobbyError("Only the Bookie makes a call");
    if (this.phase !== "round" || !this.lastRound) throw new LobbyError("The Bookie calls it in the last round");
    if (team !== "red" && team !== "blue") throw new LobbyError("Pick Red or Blue");
    this.bookieCall = team;
  }

  private startRound(at: number): void {
    this.phase = "round";
    this.moved = null;
    this.endsAt = at + this.plan[this.round].seconds * 1000;
  }

  private timeUp(at: number): void {
    switch (this.phase) {
      case "vote":
        this.electTopVoted(0);
        this.electTopVoted(1);
        this.startRound(at);
        return;
      case "round":
        this.exchange(at);
        this.phase = "moving";
        this.endsAt = at + MOVING_SECONDS * 1000 * this.scale;
        return;
      case "moving":
        if (this.lastRound) this.finish();
        else {
          this.round += 1;
          this.startRound(at);
        }
        return;
      default:
        this.endsAt = null;
    }
  }

  /** Fills missing hostage picks at random, then swaps both rooms' hostages at the same time. */
  private exchange(at: number): void {
    const sent: [GamePlayer[], GamePlayer[]] = [[], []];
    for (const room of [0, 1] as RoomIndex[]) {
      this.electTopVoted(room);
      const eligible = this.inRoom(room).filter((p) => p.id !== this.leaders[room]);
      const picked = eligible.filter((p) => this.hostages[room].includes(p.id));
      const rest = shuffle(
        eligible.filter((p) => !picked.includes(p)),
        this.random,
      );
      const need = Math.min(this.plan[this.round].hostages, eligible.length);
      sent[room] = [...picked, ...rest].slice(0, need);
    }
    for (const room of [0, 1] as RoomIndex[]) {
      for (const p of sent[room]) {
        p.room = other(room);
        p.vote = null;
      }
    }
    // Votes only count inside your own room.
    for (const p of this.players) if (p.vote && this.player(p.vote).room !== p.room) p.vote = null;
    this.moved = [sent[1].map((p) => p.id), sent[0].map((p) => p.id)];
    this.requests = [];
    this.hostages = [[], []];
    this.checkLeader(0, at);
    this.checkLeader(1, at);
  }

  private finish(): void {
    this.phase = "results";
    this.endsAt = null;
    const roomOf = (card: CardId) => this.players.find((p) => p.card === card)?.room;
    const winner: WinningTeam = roomOf("boss") === roomOf("busta") ? "red" : "blue";
    const bookie = this.players.find((p) => p.card === "bookie");
    this.results = {
      winner,
      cards: this.players.map((p) => ({ id: p.id, card: p.card, team: p.team })),
      bookie: bookie ? { id: bookie.id, call: this.bookieCall, won: this.bookieCall === winner } : null,
    };
  }
}
