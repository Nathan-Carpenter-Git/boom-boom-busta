export const MIN_PLAYERS = 6;
export const MAX_PLAYERS = 30;
export const MAX_NAME_LENGTH = 16;

export const ROOM_NAMES = ["The Basement", "The Rooftop"] as const;
export type RoomIndex = 0 | 1;

export interface RoundPlan {
  minutes: number;
  hostages: number;
}

/** Round lengths and hostages sent per room each round (the standard three round game). */
export function roundPlan(playerCount: number): RoundPlan[] {
  const hostages = playerCount >= 22 ? [3, 2, 1] : playerCount >= 11 ? [2, 1, 1] : [1, 1, 1];
  return [3, 2, 1].map((minutes, i) => ({ minutes, hostages: hostages[i] }));
}
