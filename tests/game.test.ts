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
function makeGame(cards: (CardId | Dealt)[], influence = false) {
  const seats = cards.map((c, i) => {
    const dealt = typeof c === "string" ? { card: c, team: fixedTeam(c) ?? "blue" } : c;
    return { id: `p${i}`, name: `P${i}`, ...dealt, room: (i % 2) as RoomIndex };
  });
  return new Game(seats, T0, { random: first, influence });
}

const SIX: CardId[] = ["boss", "busta", "blue-crew", "red-crew", "blue-crew", "red-crew"];

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

describe("the end", () => {
  /** Plays three rounds; `sends` lists who each leader sends per round, as [Basement, Rooftop]. */
  function play(cards: CardId[], sends: [string, string][]) {
    const game = makeGame(cards);
    electLeaders(game);
    sends.forEach(([fromBasement, fromRooftop], round) => {
      expect(game.round).toBe(round);
      game.act("p2", { type: "pickHostage", playerId: fromBasement }, T0);
      game.act("p3", { type: "pickHostage", playerId: fromRooftop }, T0);
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
    expect(game.endsAt).toBeNull();
  });

  it("Blue wins when they end in different rooms", () => {
    const game = play(SIX, [...shuffleCrew, ["p4", "p5"]]);
    expect(roomOf(game, "p0")).not.toBe(roomOf(game, "p1"));
    expect(game.results?.winner).toBe("blue");
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

describe("Influence", () => {
  const influenceOf = (game: Game, id: string) => game.player(id).influence;

  it("is off unless the host turned it on, and then nobody can spend", () => {
    const game = makeGame(SIX);
    expect(game.view("p0", T0).influence).toBeNull();
    expect(() => game.act("p0", { type: "campaign", for: "p2" }, T0)).toThrow("Influence is off");
    expect(() => game.act("p0", { type: "demand", target: "p2", kind: "color" }, T0)).toThrow("Influence is off");
    expect(game.view("p0", T0).spends).toEqual([]);
  });

  it("starts at 2 and gains 1 at the start of rounds 2 and 3, shown to the whole room", () => {
    const game = makeGame(SIX, true);
    expect(game.view("p0", T0).influence).toEqual({ p0: 2, p2: 2, p4: 2 });
    electLeaders(game);
    expect(influenceOf(game, "p0")).toBe(2);
    game.advance(game.endsAt as number);
    // Not during the moving screen.
    expect(game.phase).toBe("moving");
    expect(influenceOf(game, "p0")).toBe(2);
    expect(() => game.act("p0", { type: "demand", target: "p2", kind: "color" }, T0)).toThrow("during a round");
    game.advance(game.endsAt as number);
    expect(game.round).toBe(1);
    expect(game.players.map((p) => p.influence)).toEqual([3, 3, 3, 3, 3, 3]);
    finishRound(game);
    expect(game.round).toBe(2);
    expect(influenceOf(game, "p5")).toBe(4);
    finishRound(game);
    expect(game.phase).toBe("results");
    expect(influenceOf(game, "p5")).toBe(4);
    expect(() => game.act("p0", { type: "campaign", for: "p2" }, T0)).toThrow("during a round");
  });

  it("deducts each spend and never goes below 0", () => {
    const game = makeGame(SIX, true);
    game.act("p0", { type: "demand", target: "p2", kind: "color" }, T0);
    expect(influenceOf(game, "p0")).toBe(0);
    expect(() => game.act("p0", { type: "campaign", for: "p2" }, T0)).toThrow("costs 1 Influence and you have 0");
    expect(() => game.act("p2", { type: "demand", target: "p0", kind: "card" }, T0)).toThrow("costs 4");
    expect(influenceOf(game, "p2")).toBe(2);
    game.act("p2", { type: "campaign", for: "p4" }, T0);
    game.act("p2", { type: "campaign", for: "p0" }, T0);
    expect(influenceOf(game, "p2")).toBe(0);
    expect(() => game.act("p2", { type: "campaign", for: "p4" }, T0)).toThrow("you have 0");
  });

  it("only spends on another player in your room who is still in the game", () => {
    const game = makeGame(SIX, true);
    expect(() => game.act("p0", { type: "campaign", for: "p0" }, T0)).toThrow("someone else");
    expect(() => game.act("p0", { type: "demand", target: "p0", kind: "card" }, T0)).toThrow("someone else");
    expect(() => game.act("p0", { type: "campaign", for: "p1" }, T0)).toThrow("not in your room");
    expect(() => game.act("p0", { type: "demand", target: "p1", kind: "color" }, T0)).toThrow("not in your room");
    expect(() => game.act("p0", { type: "demand", target: "p2", kind: "nope" as never }, T0)).toThrow("Unknown");
    game.depart("p4", T0);
    expect(() => game.act("p0", { type: "campaign", for: "p4" }, T0)).toThrow("left the game");
    expect(influenceOf(game, "p0")).toBe(2);
  });

  it("a Campaign counts twice toward the majority", () => {
    const game = makeGame(SIX, true);
    // Three players in The Basement: one campaigning vote (2) is more than half.
    game.act("p0", { type: "campaign", for: "p4" }, T0);
    expect(game.player("p0").vote).toBe("p4");
    expect(game.leaders[0]).toBe("p4");
    expect(game.view("p2", T0).campaigns).toEqual(["p0"]);
    expect(game.view("p2", T0).votes).toEqual({ p0: "p4" });
    expect(game.view("p1", T0).campaigns).toEqual([]);
    // Two plain votes (2) can't beat it.
    game.act("p2", { type: "vote", for: "p2" }, T0);
    game.act("p4", { type: "vote", for: "p2" }, T0);
    expect(game.leaders[0]).toBe("p2");
  });

  it("a Campaign also weighs in when the vote runs out of time", () => {
    // Four players in The Rooftop: 2 votes for p5 is no majority, but beats p3's 1 at 0:00.
    const game = makeGame([...SIX, "blue-crew", "red-crew"], true);
    game.act("p1", { type: "campaign", for: "p5" }, T0);
    game.act("p3", { type: "vote", for: "p3" }, T0);
    expect(game.leaders[1]).toBeNull();
    game.advance(game.endsAt as number);
    expect(game.leaders[1]).toBe("p5");
  });

  it("ends a Campaign when the vote changes, with no refund, and refuses a repeat", () => {
    const game = makeGame(SIX, true);
    game.act("p0", { type: "campaign", for: "p2" }, T0);
    expect(() => game.act("p0", { type: "campaign", for: "p2" }, T0)).toThrow("already campaigning");
    // Voting for the same player again keeps it.
    game.act("p0", { type: "vote", for: "p2" }, T0);
    expect(game.player("p0").campaign).toBe(true);
    game.act("p0", { type: "vote", for: "p4" }, T0);
    expect(game.player("p0").campaign).toBe(false);
    expect(influenceOf(game, "p0")).toBe(1);
    game.act("p0", { type: "campaign", for: "p2" }, T0);
    game.act("p0", { type: "vote", for: null }, T0);
    expect(game.player("p0").campaign).toBe(false);
    expect(influenceOf(game, "p0")).toBe(0);
  });

  it("carries a Campaign from the leader vote into round 1 and ends it at the exchange", () => {
    const game = makeGame(SIX, true);
    game.act("p0", { type: "campaign", for: "p2" }, T0);
    game.act("p1", { type: "vote", for: "p3" }, T0);
    game.act("p3", { type: "vote", for: "p3" }, T0);
    expect(game.phase).toBe("round");
    expect(game.player("p0").campaign).toBe(true);
    game.act("p2", { type: "pickHostage", playerId: "p4" }, T0);
    game.advance(game.endsAt as number);
    expect(game.player("p0").vote).toBe("p2");
    expect(game.player("p0").campaign).toBe(false);
    expect(game.view("p0", T0).campaigns).toEqual([]);
  });

  it("ends a Campaign when its target leaves the game", () => {
    const game = makeGame(SIX, true);
    game.act("p0", { type: "campaign", for: "p2" }, T0);
    game.depart("p2", T0);
    expect(game.player("p0")).toMatchObject({ vote: null, campaign: false });
  });

  it("shows a demand only to the demander, and upgrades a color to a card", () => {
    const game = makeGame(SIX, true);
    electLeaders(game);
    finishRound(game);
    finishRound(game);
    expect(game.round).toBe(2);
    // p0 sees p2's color for 2, then the whole card for 4 more.
    game.act("p0", { type: "demand", target: "p2", kind: "color" }, T0);
    expect(game.view("p0", T0).known).toEqual([{ id: "p2", team: "blue", via: "color demand" }]);
    expect(() => game.act("p0", { type: "demand", target: "p2", kind: "color" }, T0)).toThrow("already know");
    expect(influenceOf(game, "p0")).toBe(2);
    for (const id of ["p1", "p2", "p3", "p4", "p5"]) expect(game.view(id, T0).known).toEqual([]);
    const fresh = makeGame(SIX, true);
    electLeaders(fresh);
    finishRound(fresh);
    finishRound(fresh);
    fresh.act("p0", { type: "demand", target: "p2", kind: "color" }, T0);
    fresh.act("p0", { type: "requestShare", to: "p4", kind: "color" }, T0);
    fresh.act("p4", { type: "answerShare", requestId: "1", accept: true }, T0);
    // A color share counts as knowing the color too.
    expect(() => fresh.act("p0", { type: "demand", target: "p4", kind: "color" }, T0)).toThrow("already know");
    expect(influenceOf(fresh, "p0")).toBe(2);

    const rich = makeGame(SIX, true);
    electLeaders(rich);
    finishRound(rich);
    finishRound(rich);
    rich.act("p0", { type: "demand", target: "p4", kind: "card" }, T0);
    expect(rich.view("p0", T0).known).toEqual([{ id: "p4", team: "blue", card: "blue-crew", via: "card demand" }]);
    expect(rich.view("p4", T0).known).toEqual([]);
    expect(influenceOf(rich, "p0")).toBe(0);
  });

  it("upgrades a known color with a card demand and refuses one for a card already seen", () => {
    const game = makeGame(SIX, true);
    electLeaders(game);
    finishRound(game);
    finishRound(game);
    // The exchanges sent p4 and p1 back and forth: p0, p2 and p4 are in The Basement again.
    expect(game.inRoom(0).map((p) => p.id)).toEqual(["p0", "p2", "p4"]);
    game.act("p0", { type: "requestShare", to: "p2", kind: "color" }, T0);
    game.act("p2", { type: "answerShare", requestId: "1", accept: true }, T0);
    game.act("p0", { type: "demand", target: "p2", kind: "card" }, T0);
    expect(game.view("p0", T0).known).toEqual([{ id: "p2", team: "blue", card: "blue-crew", via: "card demand" }]);
    // A later color share never downgrades it.
    game.act("p2", { type: "requestShare", to: "p0", kind: "color" }, T0);
    game.act("p0", { type: "answerShare", requestId: "2", accept: true }, T0);
    expect(game.view("p0", T0).known[0].via).toBe("card demand");

    const other = makeGame(SIX, true);
    electLeaders(other);
    finishRound(other);
    finishRound(other);
    other.act("p4", { type: "reveal" }, T0);
    expect(() => other.act("p0", { type: "demand", target: "p4", kind: "card" }, T0)).toThrow("already know");
    expect(() => other.act("p0", { type: "demand", target: "p4", kind: "color" }, T0)).toThrow("already know");
    expect(influenceOf(other, "p0")).toBe(4);
  });

  it("logs each spend for the room it happened in, until the next exchange", () => {
    const game = makeGame(SIX, true);
    game.act("p0", { type: "campaign", for: "p2" }, T0);
    game.act("p2", { type: "demand", target: "p4", kind: "color" }, T0);
    game.act("p1", { type: "campaign", for: "p3" }, T0);
    const basement = [
      { by: "p0", target: "p2", kind: "campaign" },
      { by: "p2", target: "p4", kind: "color" },
    ];
    for (const id of ["p0", "p2", "p4"]) expect(game.view(id, T0).spends).toEqual(basement);
    expect(game.view("p5", T0).spends).toEqual([{ by: "p1", target: "p3", kind: "campaign" }]);
    // The log carries from the leader vote into round 1.
    game.act("p4", { type: "vote", for: "p2" }, T0);
    game.act("p3", { type: "vote", for: "p3" }, T0);
    expect(game.phase).toBe("round");
    expect(game.view("p4", T0).spends).toEqual(basement);
    game.act("p2", { type: "pickHostage", playerId: "p4" }, T0);
    game.advance(game.endsAt as number);
    // p4 arrives in The Rooftop and sees nothing from before.
    expect(game.view("p4", T0).spends).toEqual([]);
    expect(game.view("p0", T0).spends).toEqual([]);
  });
});
