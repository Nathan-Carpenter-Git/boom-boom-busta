// Every card in the game. The art for each card is drawn in code (client/src/CardArt.tsx), keyed by `id`.

export type Team = "blue" | "red" | "grey";

export interface CardDef {
  id: CardId;
  name: string;
  team: Team;
  /** One line shown under the name on the card. */
  tagline: string;
  /** What the card means for its holder, shown when they inspect it. */
  goal: string;
}

export type CardId = "boss" | "busta" | "blue-crew" | "red-crew" | "bookie";

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
};

export const TEAM_LABEL: Record<Team, string> = {
  blue: "Blue team",
  red: "Red team",
  grey: "No team",
};

/**
 * The deck for a game of `playerCount` players, following the basic Two Rooms and a Boom setup:
 * one Boss, one Busta, equal Blue and Red crews, and the Bookie when the count is odd.
 */
export function buildDeck(playerCount: number): CardId[] {
  const deck: CardId[] = ["boss", "busta"];
  if (playerCount % 2 === 1) deck.push("bookie");
  const crewEach = (playerCount - deck.length) / 2;
  for (let i = 0; i < crewEach; i++) deck.push("blue-crew", "red-crew");
  return deck;
}
