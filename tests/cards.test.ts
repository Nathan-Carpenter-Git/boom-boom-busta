import { describe, expect, it } from "vitest";
import { type CardId, type Dealt, dealCards, dealSummary, fixedTeam, SPECIAL_CARDS, type Team } from "../shared/cards";

/** A small seeded generator (mulberry32), so failures can be replayed. */
function seeded(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const count = (deck: Dealt[], test: (d: Dealt) => boolean) => deck.filter(test).length;
const teamSize = (deck: Dealt[], team: Team) => count(deck, (d) => d.team === team);
const isCrew = (d: Dealt) => d.card === "blue-crew" || d.card === "red-crew";

/** Every rule from RULES.md "Players and cards" that holds for any deal. */
function expectValidDeal(deck: Dealt[], players: number, specials: CardId[]) {
  expect(deck).toHaveLength(players);
  expect(count(deck, (d) => d.card === "boss")).toBe(1);
  expect(count(deck, (d) => d.card === "busta")).toBe(1);
  expect(Math.abs(teamSize(deck, "blue") - teamSize(deck, "red"))).toBeLessThanOrEqual(1);
  for (const d of deck) {
    const fixed = fixedTeam(d.card);
    if (fixed) expect(d.team).toBe(fixed);
    else expect(["blue", "red"]).toContain(d.team);
  }
  const dealtSpecials = deck.filter((d) => SPECIAL_CARDS.includes(d.card)).map((d) => d.card);
  expect(new Set(dealtSpecials).size).toBe(dealtSpecials.length);
  for (const id of dealtSpecials) expect(specials).toContain(id);
  expect(dealtSpecials).toHaveLength(Math.min(specials.length, players - 2));
  expect(count(deck, isCrew)).toBe(players - 2 - dealtSpecials.length);
}

const ALL: CardId[] = ["truth-teller", "liar"];

describe("dealing", () => {
  // Players, enabled specials, then the cards that must be dealt and the team sizes (smaller first).
  it.each<[number, CardId[], Partial<Record<CardId | "crew", number>>, [number, number]]>([
    [6, [], { crew: 4 }, [3, 3]],
    [7, [], { crew: 5 }, [3, 4]],
    [7, ["liar"], { liar: 1, crew: 4 }, [3, 4]],
    [6, ["truth-teller", "liar"], { "truth-teller": 1, liar: 1, crew: 2 }, [3, 3]],
    [7, ALL, { "truth-teller": 1, liar: 1, crew: 3 }, [3, 4]],
    [30, ALL, { "truth-teller": 1, liar: 1, crew: 26 }, [15, 15]],
    [3, ["liar"], { liar: 1 }, [1, 2]],
  ])("%i players with %j", (players, specials, cards, teams) => {
    for (let seed = 1; seed <= 20; seed++) {
      const deck = dealCards(players, specials, seeded(seed));
      expectValidDeal(deck, players, specials);
      for (const [card, n] of Object.entries(cards)) {
        expect(count(deck, (d) => (card === "crew" ? isCrew(d) : d.card === card))).toBe(n);
      }
      const sizes = [teamSize(deck, "blue"), teamSize(deck, "red")].sort((a, b) => a - b);
      expect(sizes).toEqual(teams);
    }
  });

  it("puts the Truth Teller and the Liar on opposite teams when both are dealt", () => {
    const teams = new Set<string>();
    for (let seed = 1; seed <= 50; seed++) {
      const deck = dealCards(6, ["truth-teller", "liar"], seeded(seed));
      const team = (card: CardId) => deck.find((d) => d.card === card)?.team;
      expect(team("truth-teller")).not.toBe(team("liar"));
      teams.add(team("liar") ?? "");
    }
    expect(teams).toEqual(new Set(["blue", "red"]));
  });

  it("picks which specials to deal at random when they outnumber the seats", () => {
    const left = new Set<CardId>();
    for (let seed = 1; seed <= 50; seed++) {
      const deck = dealCards(3, ALL, seeded(seed));
      expectValidDeal(deck, 3, ALL);
      for (const id of ALL) if (!deck.some((d) => d.card === id)) left.add(id);
    }
    expect(left).toEqual(new Set(ALL));
  });

  it("gives an unbalanced extra seat to either team at random", () => {
    const bigger = new Set<string>();
    for (let seed = 1; seed <= 50; seed++) {
      const deck = dealCards(7, [], seeded(seed));
      bigger.add(teamSize(deck, "blue") > teamSize(deck, "red") ? "blue" : "red");
    }
    expect(bigger).toEqual(new Set(["blue", "red"]));
  });

  it("follows the rules for every mix of specials from 6 to 30 players (randomized)", () => {
    const random = seeded(2026);
    for (let mask = 0; mask < 1 << SPECIAL_CARDS.length; mask++) {
      const specials = SPECIAL_CARDS.filter((_, i) => mask & (1 << i));
      for (let players = 6; players <= 30; players++) {
        for (let run = 0; run < 10; run++) expectValidDeal(dealCards(players, specials, random), players, specials);
      }
    }
  });

  it("ignores unknown or repeated specials", () => {
    const deck = dealCards(8, ["liar", "liar", "boss", "blue-crew"], seeded(1));
    expectValidDeal(deck, 8, ["liar"]);
  });
});

describe("deal summary", () => {
  it("says what a deal gives at this player count", () => {
    expect(dealSummary(6, ["liar"])).toBe("6 players: Boss, Busta, Liar, 3 Crew");
    expect(dealSummary(7, ALL)).toBe("7 players: Boss, Busta, Truth Teller, Liar, 3 Crew");
    expect(dealSummary(6, [])).toBe("6 players: Boss, Busta, 4 Crew");
    expect(dealSummary(4, ALL)).toBe("4 players: Boss, Busta, Truth Teller, Liar");
    expect(dealSummary(3, ALL)).toBe("3 players: Boss, Busta, 1 random special card of 2");
  });
});
