// Move cards: a hand of one-shot actions every player holds on top of their identity card.
// The rules for each Move live in RULES.md; the card text here is what the card itself says.

export type MoveId = "forgery" | "alibi" | "wiretap" | "peek" | "demand";

export interface MoveDef {
  id: MoveId;
  name: string;
  /** Secret Moves are never announced; the room only sees your hand get smaller. */
  secret: boolean;
  /** The rule in one sentence, for the lobby and the rules page. */
  text: string;
  /** The same rule broken into short lines that fit on the card. */
  lines: string[];
}

export const MOVES: Record<MoveId, MoveDef> = {
  forgery: {
    id: "forgery",
    name: "Forgery",
    secret: true,
    text: "The next time anyone sees your card this round, they see a card you choose instead.",
    lines: ["Next time anyone sees", "your card this round,", "they see a card", "you choose instead."],
  },
  alibi: {
    id: "alibi",
    name: "Alibi",
    secret: true,
    text: "The next time anyone sees your color this round, they see the other team's color.",
    lines: ["Next time anyone sees", "your color this round,", "they see the other", "team's color."],
  },
  wiretap: {
    id: "wiretap",
    name: "Wiretap",
    secret: true,
    text: "See what the next share in your room shows, whoever makes it.",
    lines: ["See what the next", "share in your room", "shows, whoever", "makes it."],
  },
  peek: {
    id: "peek",
    name: "Peek",
    secret: true,
    text: "See the team color of one player in your room. They aren't told.",
    lines: ["See the team color", "of one player in", "your room. They", "aren't told."],
  },
  demand: {
    id: "demand",
    name: "Demand",
    secret: false,
    text: "One player in your room must show you their card. You show nothing back.",
    lines: ["One player in your", "room must show you", "their card. You show", "nothing back."],
  },
};

export const MOVE_IDS = Object.keys(MOVES) as MoveId[];
