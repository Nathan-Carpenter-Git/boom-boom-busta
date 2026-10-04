// Small wrappers around localStorage: it can be missing or throw (private mode, blocked storage),
// and the game must still work without it, just without resuming a seat after a reload.

const SESSION_KEY = "bbb:session";
const NAME_KEY = "bbb:name";

export interface Session {
  code: string;
  playerId: string;
  token: string;
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Storage unavailable.
  }
}

export function loadSession(): Session | null {
  try {
    const s = JSON.parse(read(SESSION_KEY) ?? "null");
    return typeof s?.code === "string" && typeof s?.playerId === "string" && typeof s?.token === "string" ? s : null;
  } catch {
    return null;
  }
}

export const saveSession = (s: Session | null) => write(SESSION_KEY, s && JSON.stringify(s));

const NAME_PARTS = [
  ["Sneaky", "Shady", "Slick", "Jumpy", "Sly", "Fuzzy", "Lucky", "Sweaty", "Smooth", "Twitchy"],
  ["Pete", "Lou", "Mo", "Dot", "Vic", "Bea", "Sal", "Gus", "Roz", "Tex"],
];

export function loadName(): string {
  const saved = read(NAME_KEY);
  if (saved) return saved;
  const pick = (list: string[]) => list[Math.floor(Math.random() * list.length)];
  return `${pick(NAME_PARTS[0])} ${pick(NAME_PARTS[1])}`;
}

export const saveName = (name: string) => write(NAME_KEY, name);
