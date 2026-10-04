import { describe, expect, it } from "vitest";
import { LobbyError, LobbyManager } from "../server/lobby";
import { buildDeck, CARDS } from "../shared/cards";
import type { ServerMessage } from "../shared/protocol";
import { roundPlan } from "../shared/rules";

const quiet = () => {};

function fullLobby(count: number) {
  const lobbies = new LobbyManager();
  const inbox = new Map<string, ServerMessage[]>();
  const { lobby, player: host } = lobbies.create("Host", quiet);
  for (let i = 1; i < count; i++) {
    const { player } = lobbies.join(lobby.code.toLowerCase(), `P${i}`, (m) => inbox.get(player.id)?.push(m));
    inbox.set(player.id, []);
  }
  return { lobbies, lobby, host, inbox };
}

describe("deck", () => {
  it.each([6, 7, 10, 11, 30])("has one Boss, one Busta and balanced teams for %i players", (n) => {
    const deck = buildDeck(n);
    expect(deck).toHaveLength(n);
    expect(deck.filter((c) => c === "boss")).toHaveLength(1);
    expect(deck.filter((c) => c === "busta")).toHaveLength(1);
    const team = (t: string) => deck.filter((c) => CARDS[c].team === t).length;
    expect(team("blue")).toBe(team("red"));
    expect(team("grey")).toBe(n % 2);
  });

  it("sends more hostages in bigger games", () => {
    expect(roundPlan(8).map((r) => r.hostages)).toEqual([1, 1, 1]);
    expect(roundPlan(14).map((r) => r.hostages)).toEqual([2, 1, 1]);
    expect(roundPlan(24).map((r) => r.hostages)).toEqual([3, 2, 1]);
  });
});

describe("lobby", () => {
  it("creates a four letter code and joins case-insensitively", () => {
    const { lobby } = fullLobby(3);
    expect(lobby.code).toMatch(/^[A-HJ-NP-Z]{4}$/);
    expect(lobby.players.map((p) => p.name)).toEqual(["Host", "P1", "P2"]);
  });

  it("rejects bad joins", () => {
    const lobbies = new LobbyManager();
    const { lobby } = lobbies.create("Host", quiet);
    expect(() => lobbies.join("ZZZZ", "A", quiet)).toThrow(LobbyError);
    expect(() => lobbies.join(lobby.code, "   ", quiet)).toThrow("Pick a name");
    expect(() => lobbies.join(lobby.code, "host", quiet)).toThrow("already has that name");
  });

  it("only lets the host deal, and only with enough players", () => {
    const small = fullLobby(5);
    expect(() => small.lobbies.deal(small.lobby, small.host.id)).toThrow("at least 6");
    const { lobbies, lobby, host } = fullLobby(7);
    expect(() => lobbies.deal(lobby, lobby.players[1].id)).toThrow("Only the host");
    lobbies.deal(lobby, host.id);
    expect(lobby.phase).toBe("dealt");
    const rooms = lobbies.view(lobby, host.id).rooms;
    expect(rooms?.map((r) => r.length).sort()).toEqual([3, 4]);
  });

  it("never shows a player anyone else's card", () => {
    const { lobbies, lobby, host, inbox } = fullLobby(6);
    lobbies.deal(lobby, host.id);
    lobbies.broadcast(lobby);
    for (const p of lobby.players.slice(1)) {
      const last = inbox.get(p.id)?.at(-1);
      expect(last?.type).toBe("lobby");
      if (last?.type !== "lobby") continue;
      expect(last.lobby.you?.card).toBe(p.card);
      const others = lobby.players.filter((o) => o.id !== p.id).map((o) => o.card as string);
      const leaked = JSON.stringify(last.lobby).match(/"card":"[^"]+"/g) ?? [];
      expect(leaked).toHaveLength(1);
      expect(others.length).toBe(5);
    }
  });

  it("passes the host on and deletes empty lobbies", () => {
    const { lobbies, lobby, host } = fullLobby(2);
    expect(lobbies.remove(lobby, host.id)).toBe(false);
    expect(lobby.hostId).toBe(lobby.players[0].id);
    expect(lobbies.remove(lobby, lobby.players[0].id)).toBe(true);
    expect(lobbies.getLobby(lobby.code)).toBeUndefined();
  });

  it("lets a dropped player resume their seat with their token", () => {
    const { lobbies, lobby } = fullLobby(2);
    const p = lobby.players[1];
    expect(lobbies.disconnect(lobby, p.id, p.send ?? quiet)).toBe(true);
    expect(lobbies.view(lobby, p.id).players[1].connected).toBe(false);
    expect(() => lobbies.resume(lobby.code, p.id, "wrong", quiet)).toThrow(LobbyError);
    lobbies.resume(lobby.code, p.id, p.token, quiet);
    expect(lobbies.view(lobby, p.id).players[1].connected).toBe(true);
  });
});
