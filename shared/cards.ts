// Every card in the game. The art for each card is drawn in code (client/src/CardArt.tsx), keyed by `id`.

import { shuffle } from "./random.js";

export type Team = "blue" | "red" | "grey";

export interface CardDef {
  id: CardId;
  name: string;
  /** "either" cards go to Red or Blue at the deal, so a dealt card always carries its own team. */
  team: Team | "either";
  /** One line shown under the name on the card. */
  tagline: string;
  /** What the card means for its holder, shown when they inspect it. Either-team cards add their team's goal. */
  goal: string;
}

export type CardId = "boss" | "busta" | "blue-crew" | "red-crew" | "bookie" | "truth-teller" | "liar";

/** A card as dealt to a player: the card and the team it plays for. */
export interface Dealt {
  card: CardId;
  team: Team;
}

export const CARDS: Record<CardId, CardDef> = {
  boss: {
    id: "boss",
    name: "The Boss",
    team: "blue",
    tagline: "Blue team's VIP",
    goal: "Blue wins if you end the last round in a different room from the Busta.",
  },
  busta: {
    id: "busta",
    name: "The Busta",
    team: "red",
    tagline: "Red team's bomber",
    goal: "Red wins if you end the last round in the same room as the Boss.",
  },
  "blue-crew": {
    id: "blue-crew",
    name: "Blue Crew",
    team: "blue",
    tagline: "Keep the Boss safe",
    goal: "Blue wins if the Boss and the Busta end in different rooms.",
  },
  "red-crew": {
    id: "red-crew",
    name: "Red Crew",
    team: "red",
    tagline: "Get the Busta to the Boss",
    goal: "Red wins if the Boss and the Busta end in the same room.",
  },
  bookie: {
    id: "bookie",
    name: "The Bookie",
    team: "grey",
    tagline: "Bet on the winner",
    goal: "Before the last hostage exchange, call which team wins. You win if you call it right.",
  },
  "truth-teller": {
    id: "truth-teller",
    name: "The Truth Teller",
    team: "either",
    tagline: "Only speaks the truth",
    goal: "Say only true things for the whole game.",
  },
  liar: {
    id: "liar",
    name: "The Liar",
    team: "either",
    tagline: "Only speaks lies",
    goal: "Say only false things for the whole game.",
  },
};

export const TEAM_LABEL: Record<Team, string> = {
  blue: "Blue team",
  red: "Red team",
  grey: "No team",
};

/** Special cards the host can turn on and off in the lobby, in display order. */
export const SPECIAL_CARDS: CardId[] = ["bookie", "truth-teller", "liar"];
export const DEFAULT_SPECIALS: CardId[] = ["bookie"];

/** One line rule for each special card, shown in the lobby. */
export const SPECIAL_RULES: Partial<Record<CardId, string>> = {
  bookie: "No team. Calls the winner before the last exchange.",
  "truth-teller": "Red or Blue. Must only say true things.",
  liar: "Red or Blue. Must only say false things.",
};

const TEAM_GOAL: Record<"blue" | "red", string> = {
  blue: CARDS["blue-crew"].goal,
  red: CARDS["red-crew"].goal,
};

/** The full goal text for a dealt card: its own rule, plus the team goal for either-team cards. */
export function cardGoal(card: CardId, team: Team): string {
  const def = CARDS[card];
  return def.team === "either" && team !== "grey" ? `${def.goal} ${TEAM_GOAL[team]}` : def.goal;
}

/** The team a card plays for when its team is fixed by the card itself; undefined for either-team cards. */
export function fixedTeam(card: CardId): Team | undefined {
  const team = CARDS[card].team;
  return team === "either" ? undefined : team;
}

/** Keeps only known special cards, once each, in display order. */
export function cleanSpecials(specials: readonly CardId[]): CardId[] {
  return SPECIAL_CARDS.filter((id) => specials.includes(id));
}

/**
 * The cards for a game of `playerCount` players, following RULES.md "Players and cards":
 * the Boss and the Busta always; then as many of the enabled specials as fit, picked at random;
 * either-team specials join the smaller team (random on a tie); Crew fills the rest to even out
 * the teams, and a seat that can't be balanced goes to a random team. The order is not shuffled.
 */
export function dealCards(playerCount: number, specials: readonly CardId[], random: () => number): Dealt[] {
  const dealt: Dealt[] = [
    { card: "boss", team: "blue" },
    { card: "busta", team: "red" },
  ];
  const size = { blue: 1, red: 1 };
  const smaller = (): "blue" | "red" =>
    size.blue === size.red ? (random() < 0.5 ? "blue" : "red") : size.blue < size.red ? "blue" : "red";
  const add = (card: CardId, team: Team) => {
    dealt.push({ card, team });
    if (team !== "grey") size[team]++;
  };
  const taken = shuffle(cleanSpecials(specials), random).slice(0, Math.max(0, playerCount - dealt.length));
  for (const card of taken) add(card, fixedTeam(card) ?? smaller());
  while (dealt.length < playerCount) {
    const team = smaller();
    add(team === "blue" ? "blue-crew" : "red-crew", team);
  }
  return dealt;
}

/** One short line saying what a deal at this player count gives, for example "6 players: Boss, Busta, Bookie, 3 Crew". */
export function dealSummary(playerCount: number, specials: readonly CardId[]): string {
  const enabled = cleanSpecials(specials);
  const seats = Math.max(0, playerCount - 2);
  const parts = ["Boss", "Busta"];
  if (enabled.length > seats) {
    if (seats > 0) parts.push(`${seats} random special card${seats === 1 ? "" : "s"} of ${enabled.length}`);
  } else {
    parts.push(...enabled.map((id) => CARDS[id].name.replace(/^The /, "")));
  }
  const crew = seats - Math.min(seats, enabled.length);
  if (crew > 0) parts.push(`${crew} Crew`);
  return `${playerCount} players: ${parts.join(", ")}`;
}
