import { describe, expect, it } from "vitest";
import { Game, MOVING_SECONDS, VOTE_SECONDS } from "../server/game";
import { LobbyError } from "../server/util";
import { type CardId, type Dealt, fixedTeam } from "../shared/cards";
import type { RoomIndex } from "../shared/rules";

const T0 = 1_000_000;
// Always the first option, so "random" fills and ties are predictable.
const first = () => 0;

/**
 * Players p0..pN-1 with the given cards (either-team cards need their dealt team);
 * even ids start in The Basement (0), odd ids in The Rooftop (1).
 */
function makeGame(cards: (CardId | Dealt)[]) {
  const seats = cards.map((c, i) => {
    const dealt = typeof c === "string" ? { card: c, team: fixedTeam(c) ?? "grey" } : c;
    return { id: `p${i}`, name: `P${i}`, ...dealt, room: (i % 2) as RoomIndex };
  });
  return new Game(seats, T0, { random: first });
}

const SIX: CardId[] = ["boss", "busta", "blue-crew", "red-crew", "blue-crew", "red-crew"];
const SEVEN: CardId[] = [...SIX, "bookie"];

/** Elects p2 in The Basement and p3 in The Rooftop. */
function electLeaders(game: Game, now = T0) {
  game.act("p0", { type: "vote", for: "p2" }, now);
  game.act("p2", { type: "vote", for: "p2" }, now);
  game.act("p4", { type: "vote", for: "p2" }, now);
  game.act("p1", { type: "vote", for: "p3" }, now);
  game.act("p3", { type: "vote", for: "p3" }, now);
}

/** Ends the current round and the moving screen after it. */
function finishRound(game: Game) {
  game.advance(game.endsAt as number);
  expect(game.phase).toBe("moving");
  game.advance(game.endsAt as number);
}

const roomOf = (game: Game, id: string) => game.player(id).room;

describe("leaders", () => {
  it("elects the first player to reach a majority and starts round 1 once both rooms have one", () => {
    const game = makeGame(SIX);
    expect(game.phase).toBe("vote");
    game.act("p0", { type: "vote", for: "p2" }, T0);
    expect(game.leaders[0]).toBeNull();
    game.act("p4", { type: "vote", for: "p2" }, T0 + 5);
    expect(game.leaders[0]).toBe("p2");
    expect(game.phase).toBe("vote");
    game.act("p1", { type: "vote", for: "p1" }, T0 + 10);
    game.act("p5", { type: "vote", for: "p1" }, T0 + 20);
    expect(game.leaders[1]).toBe("p1");
    expect(game.phase).toBe("round");
    expect(game.endsAt).toBe(T0 + 20 + 3 * 60_000);
  });

  it("picks the top voted player when the vote runs out of time", () => {
    const game = makeGame(SIX);
    game.act("p3", { type: "vote", for: "p5" }, T0);
    expect(game.advance(T0 + VOTE_SECONDS * 1000 - 1)).toBe(false);
    game.advance(T0 + VOTE_SECONDS * 1000);
    expect(game.phase).toBe("round");
    expect(game.leaders[1]).toBe("p5");
    expect(game.leaders[0]).toBe("p0");
  });

  it("only counts votes for players in your own room", () => {
    const game = makeGame(SIX);
    expect(() => game.act("p0", { type: "vote", for: "p1" }, T0)).toThrow("not in your room");
  });

  it("lets a room usurp its leader at any time, and drops the new leader from the hostage picks", () => {
    const game = makeGame(SIX);
    electLeaders(game);
    game.act("p2", { type: "pickHostage", playerId: "p4" }, T0);
    game.act("p0", { type: "vote", for: "p4" }, T0 + 1);
    expect(game.leaders[0]).toBe("p2");
    game.act("p4", { type: "vote", for: "p4" }, T0 + 2);
    expect(game.leaders[0]).toBe("p4");
    expect(game.hostages[0]).toEqual([]);
    expect(() => game.act("p2", { type: "pickHostage", playerId: "p0" }, T0 + 3)).toThrow("Only the leader");
  });

  it("re-votes when a leader leaves the game", () => {
    const game = makeGame(SIX);
    electLeaders(game);
    game.depart("p2", T0 + 1);
    expect(game.leaders[0]).toBeNull();
    game.act("p0", { type: "vote", for: "p4" }, T0 + 2);
    expect(game.leaders[0]).toBeNull();
    game.act("p4", { type: "vote", for: "p4" }, T0 + 3);
    expect(game.leaders[0]).toBe("p4");
    expect(() => game.act("p0", { type: "vote", for: "p2" }, T0 + 4)).toThrow("left the game");
  });
});

describe("hostage exchange", () => {
  it("fills missing picks at random, swaps both rooms at once, then starts the next round", () => {
    const game = makeGame(SIX);
    electLeaders(game);
    game.act("p2", { type: "pickHostage", playerId: "p4" }, T0);
    const end = game.endsAt as number;
    game.advance(end);
    expect(game.phase).toBe("moving");
    // The Rooftop's leader picked nobody, so one of p1 and p5 was sent at random.
    const fromRooftop = game.moved?.[0][0] ?? "";
    expect(["p1", "p5"]).toContain(fromRooftop);
    expect(game.moved).toEqual([[fromRooftop], ["p4"]]);
    expect(game.view("p0", end).moved).toEqual(game.moved);
    expect(game.inRoom(0).map((p) => p.id)).toEqual(["p0", fromRooftop, "p2"].sort());
    expect(
      game
        .inRoom(1)
        .map((p) => p.id)
        .sort(),
    ).toEqual(["p1", "p3", "p4", "p5"].filter((id) => id !== fromRooftop));
    expect(game.endsAt).toBe(end + MOVING_SECONDS * 1000);
    game.advance(game.endsAt as number);
    expect(game.phase).toBe("round");
    expect(game.round).toBe(1);
    expect(game.leaders).toEqual(["p2", "p3"]);
  });

  it("keeps picks within the round's hostage count and never sends the leader", () => {
    const game = makeGame(SIX);
    electLeaders(game);
    game.act("p2", { type: "pickHostage", playerId: "p0" }, T0);
    game.act("p2", { type: "pickHostage", playerId: "p4" }, T0);
    expect(game.hostages[0]).toEqual(["p4"]);
    game.act("p2", { type: "pickHostage", playerId: "p4" }, T0);
    expect(game.hostages[0]).toEqual([]);
    expect(() => game.act("p2", { type: "pickHostage", playerId: "p2" }, T0)).toThrow("Leaders can't");
    expect(() => game.act("p2", { type: "pickHostage", playerId: "p1" }, T0)).toThrow("not in your room");
  });

  it("clears votes that point across rooms after the swap", () => {
    const game = makeGame(SIX);
    electLeaders(game);
    game.act("p2", { type: "pickHostage", playerId: "p0" }, T0);
    game.act("p3", { type: "pickHostage", playerId: "p1" }, T0);
    game.advance(game.endsAt as number);
    expect(game.player("p0").vote).toBeNull();
    expect(game.player("p1").vote).toBeNull();
    expect(game.player("p2").vote).toBe("p2");
  });
});

describe("sharing", () => {
  it("needs the other player's consent, and both sides learn", () => {
    const game = makeGame(SIX);
    game.act("p0", { type: "requestShare", to: "p2", kind: "color" }, T0);
    expect(game.view("p0", T0).known).toEqual([]);
    expect(game.view("p2", T0).requests).toEqual([{ id: "1", from: "p0", to: "p2", kind: "color" }]);
    expect(game.view("p4", T0).requests).toEqual([]);
    expect(() => game.act("p0", { type: "answerShare", requestId: "1", accept: true }, T0)).toThrow("gone");
    game.act("p2", { type: "answerShare", requestId: "1", accept: false }, T0);
    expect(game.view("p0", T0).known).toEqual([]);
    expect(game.view("p2", T0).known).toEqual([]);

    game.act("p0", { type: "requestShare", to: "p2", kind: "color" }, T0);
    game.act("p2", { type: "answerShare", requestId: "2", accept: true }, T0);
    // A color share shows the team, never the card.
    expect(game.view("p0", T0).known).toEqual([{ id: "p2", team: "blue", via: "color share" }]);
    expect(game.view("p2", T0).known).toEqual([{ id: "p0", team: "blue", via: "color share" }]);

    game.act("p2", { type: "requestShare", to: "p0", kind: "card" }, T0);
    game.act("p0", { type: "answerShare", requestId: "3", accept: true }, T0);
    expect(game.view("p2", T0).known).toEqual([{ id: "p0", team: "blue", card: "boss", via: "card share" }]);
    expect(game.view("p4", T0).known).toEqual([]);
  });

  it("only shares inside a room", () => {
    const game = makeGame(SIX);
    expect(() => game.act("p0", { type: "requestShare", to: "p1", kind: "card" }, T0)).toThrow("not in your room");
    expect(() => game.act("p0", { type: "requestShare", to: "p0", kind: "card" }, T0)).toThrow(LobbyError);
  });

  it("drops share requests at the exchange", () => {
    const game = makeGame(SIX);
    electLeaders(game);
    game.act("p0", { type: "requestShare", to: "p4", kind: "card" }, T0);
    game.advance(game.endsAt as number);
    expect(game.requests).toEqual([]);
  });

  it("shows a public reveal to everyone in the room, and they keep it after moving", () => {
    const game = makeGame(SIX);
    game.act("p1", { type: "reveal" }, T0);
    for (const id of ["p3", "p5"]) {
      expect(game.view(id, T0).known).toEqual([{ id: "p1", team: "red", card: "busta", via: "public reveal" }]);
    }
    for (const id of ["p0", "p2", "p4"]) expect(game.view(id, T0).known).toEqual([]);
    electLeaders(game);
    game.act("p3", { type: "pickHostage", playerId: "p5" }, T0);
    game.advance(game.endsAt as number);
    expect(roomOf(game, "p5")).toBe(0);
    expect(game.view("p5", T0).known).toHaveLength(1);
  });
});

describe("the Bookie and the end", () => {
  /** Plays three rounds; `sends` lists who each leader sends per round, as [Basement, Rooftop]. */
  function play(cards: CardId[], sends: [string, string][], beforeLastExchange?: (game: Game) => void) {
    const game = makeGame(cards);
    electLeaders(game);
    sends.forEach(([fromBasement, fromRooftop], round) => {
      expect(game.round).toBe(round);
      game.act("p2", { type: "pickHostage", playerId: fromBasement }, T0);
      game.act("p3", { type: "pickHostage", playerId: fromRooftop }, T0);
      if (round === 2) beforeLastExchange?.(game);
      finishRound(game);
    });
    expect(game.phase).toBe("results");
    return game;
  }

  // p0 is the Boss and starts in The Basement; p1 is the Busta and starts in The Rooftop.
  const shuffleCrew: [string, string][] = [
    ["p4", "p5"],
    ["p5", "p4"],
  ];

  it("Red wins when the Boss and the Busta end in the same room", () => {
    const game = play(SIX, [...shuffleCrew, ["p0", "p5"]]);
    expect(roomOf(game, "p0")).toBe(roomOf(game, "p1"));
    expect(game.results?.winner).toBe("red");
    expect(game.results?.cards).toHaveLength(6);
    expect(game.results?.bookie).toBeNull();
    expect(game.endsAt).toBeNull();
  });

  it("Blue wins when they end in different rooms", () => {
    const game = play(SIX, [...shuffleCrew, ["p4", "p5"]]);
    expect(roomOf(game, "p0")).not.toBe(roomOf(game, "p1"));
    expect(game.results?.winner).toBe("blue");
  });

  it("the Bookie calls in the last round and wins on a right call", () => {
    const game = play(SEVEN, [...shuffleCrew, ["p0", "p5"]], (g) => {
      expect(() => g.act("p0", { type: "bookieCall", team: "red" }, T0)).toThrow("Only the Bookie");
      g.act("p6", { type: "bookieCall", team: "blue" }, T0);
      g.act("p6", { type: "bookieCall", team: "red" }, T0);
      expect(g.view("p6", T0).bookieCall).toBe("red");
      expect(g.view("p0", T0).bookieCall).toBeNull();
    });
    expect(game.results?.bookie).toEqual({ id: "p6", call: "red", won: true });
    expect(game.view("p0", T0).bookieCall).toBe("red");
  });

  it("the Bookie can't call before the last round, and loses without a call", () => {
    const early = makeGame(SEVEN);
    electLeaders(early);
    expect(() => early.act("p6", { type: "bookieCall", team: "red" }, T0)).toThrow("last round");
    const game = play(SEVEN, [...shuffleCrew, ["p4", "p5"]]);
    expect(game.results?.bookie).toEqual({ id: "p6", call: null, won: false });
  });
});

describe("the Truth Teller and the Liar", () => {
  // p4 is a Red Truth Teller in The Basement, p5 a Blue Liar in The Rooftop.
  const SPECIALS: (CardId | Dealt)[] = [
    "boss",
    "busta",
    "blue-crew",
    "red-crew",
    { card: "truth-teller", team: "red" },
    { card: "liar", team: "blue" },
  ];

  it("shows their dealt team in color shares, card shares and reveals", () => {
    const game = makeGame(SPECIALS);
    game.act("p0", { type: "requestShare", to: "p4", kind: "color" }, T0);
    game.act("p4", { type: "answerShare", requestId: "1", accept: true }, T0);
    expect(game.view("p0", T0).known).toEqual([{ id: "p4", team: "red", via: "color share" }]);
    expect(game.view("p4", T0).known).toEqual([{ id: "p0", team: "blue", via: "color share" }]);
    game.act("p2", { type: "requestShare", to: "p4", kind: "card" }, T0);
    game.act("p4", { type: "answerShare", requestId: "2", accept: true }, T0);
    expect(game.view("p2", T0).known).toEqual([{ id: "p4", team: "red", card: "truth-teller", via: "card share" }]);
    game.act("p5", { type: "reveal" }, T0);
    expect(game.view("p1", T0).known).toEqual([{ id: "p5", team: "blue", card: "liar", via: "public reveal" }]);
  });

  it("show their team in the results and leave the win check alone", () => {
    const game = makeGame(SPECIALS);
    electLeaders(game);
    // The two specials swap rooms every round.
    for (let round = 0; round < 3; round++) {
      game.act("p2", { type: "pickHostage", playerId: round === 1 ? "p5" : "p4" }, T0);
      game.act("p3", { type: "pickHostage", playerId: round === 1 ? "p4" : "p5" }, T0);
      finishRound(game);
    }
    expect(game.results?.cards).toContainEqual({ id: "p4", card: "truth-teller", team: "red" });
    expect(game.results?.cards).toContainEqual({ id: "p5", card: "liar", team: "blue" });
    // The Boss (p0) and the Busta (p1) never moved.
    expect(game.results?.winner).toBe("blue");
  });
});
