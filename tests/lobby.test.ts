import { afterEach, describe, expect, it, vi } from "vitest";
import { LobbyError, LobbyManager } from "../server/lobby";
import { SPECIAL_CARDS } from "../shared/cards";
import type { GameAction, LobbyView, ServerMessage } from "../shared/protocol";
import { roundPlan } from "../shared/rules";

const quiet = () => {};

function fullLobby(count: number, lobbies = new LobbyManager()) {
  const inbox = new Map<string, ServerMessage[]>();
  const { lobby, player: host } = lobbies.create("Host", quiet);
  for (let i = 1; i < count; i++) {
    const { player } = lobbies.join(lobby.code.toLowerCase(), `P${i}`, (m) => inbox.get(player.id)?.push(m));
    inbox.set(player.id, []);
  }
  return { lobbies, lobby, host, inbox };
}

describe("rounds", () => {
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
    expect(lobby.phase).toBe("game");
    const rooms = lobbies.view(lobby, host.id).game?.rooms;
    expect(rooms?.map((r) => r.players.length).sort()).toEqual([3, 4]);
  });

  it("lets only the host pick the special cards, between games, and keeps them from game to game", () => {
    const { lobbies, lobby, host } = fullLobby(6);
    const guest = lobby.players[1].id;
    expect(lobbies.view(lobby, guest).settings.specials).toEqual(["bookie"]);
    expect(() => lobbies.setSpecial(lobby, guest, "liar", true)).toThrow("Only the host");
    lobbies.setSpecial(lobby, host.id, "liar", true);
    lobbies.setSpecial(lobby, host.id, "truth-teller", true);
    lobbies.setSpecial(lobby, host.id, "liar", true);
    lobbies.setSpecial(lobby, host.id, "bookie", false);
    expect(lobbies.view(lobby, guest).settings.specials).toEqual(["truth-teller", "liar"]);
    expect(() => lobbies.setSpecial(lobby, host.id, "boss", false)).toThrow("not a special card");
    expect(() => lobbies.setSpecial(lobby, host.id, "nope" as never, true)).toThrow("not a special card");

    lobbies.deal(lobby, host.id);
    const dealt = lobby.game?.players.map((p) => p.card) ?? [];
    expect(dealt).toContain("truth-teller");
    expect(dealt).toContain("liar");
    expect(dealt).not.toContain("bookie");
    expect(() => lobbies.setSpecial(lobby, host.id, "bookie", true)).toThrow("between games");
    expect(lobbies.view(lobby, guest).settings.specials).toEqual(["truth-teller", "liar"]);
    lobbies.backToLobby(lobby, host.id);
    expect(lobbies.view(lobby, guest).settings.specials).toEqual(["truth-teller", "liar"]);
  });

  it("deals every turned on special card, with each player's own team", () => {
    const { lobbies, lobby, host } = fullLobby(6);
    for (const id of SPECIAL_CARDS) lobbies.setSpecial(lobby, host.id, id, true);
    lobbies.deal(lobby, host.id);
    const game = lobby.game;
    if (!game) throw new Error("no game");
    expect(game.players.map((p) => p.card).sort()).toEqual(
      [
        "boss",
        "busta",
        "bookie",
        "truth-teller",
        "liar",
        game.players.find((p) => p.card.endsWith("crew"))?.card,
      ].sort(),
    );
    for (const p of lobby.players) {
      const me = game.player(p.id);
      expect(lobbies.view(lobby, p.id).you).toEqual({ card: me.card, team: me.team, room: me.room });
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

/** Every (player id, team or card) pair a view discloses about other players, wherever it sits in the view. */
function disclosures(view: LobbyView): { id: string; level: "team" | "card" }[] {
  const found: { id: string; level: "team" | "card" }[] = [];
  const walk = (value: unknown) => {
    if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === "object") {
      const o = value as Record<string, unknown>;
      if (typeof o.id === "string" && "card" in o) found.push({ id: o.id, level: "card" });
      else if (typeof o.id === "string" && "team" in o) found.push({ id: o.id, level: "team" });
      Object.values(o).forEach(walk);
    }
  };
  walk(view.game);
  return found;
}

describe("a whole game through the lobby manager", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("plays from deal to results on server timers, never leaking a card it shouldn't", () => {
    vi.useFakeTimers();
    const lobbies = new LobbyManager(6, { timeScale: 0.01 });
    const { lobby, host, inbox } = fullLobby(7, lobbies);
    for (const id of SPECIAL_CARDS) lobbies.setSpecial(lobby, host.id, id, true);
    inbox.set(host.id, []);
    host.send = (m) => inbox.get(host.id)?.push(m);
    lobbies.deal(lobby, host.id);
    const game = lobby.game;
    if (!game) throw new Error("no game");
    const ids = lobby.players.map((p) => p.id);
    // What the test expects each player may know: "viewer>target" to "team" or "card".
    const entitled = new Map<string, "team" | "card">();
    const grant = (viewer: string, target: string, level: "team" | "card") => {
      if (entitled.get(`${viewer}>${target}`) !== "card") entitled.set(`${viewer}>${target}`, level);
    };
    let checked = 0;
    const check = () => {
      for (const id of ids) {
        for (const m of inbox.get(id)?.splice(0) ?? []) {
          if (m.type !== "lobby") continue;
          checked++;
          expect(m.lobby.you?.card).toBe(game.player(id).card);
          expect(m.lobby.you?.team).toBe(game.player(id).team);
          for (const k of m.lobby.game?.known ?? []) expect(k.team).toBe(game.player(k.id).team);
          if (m.lobby.game?.phase === "results") continue;
          for (const d of disclosures(m.lobby)) {
            const allowed = entitled.get(`${id}>${d.id}`);
            expect(allowed === "card" || allowed === d.level, `${id} saw ${d.level} of ${d.id}`).toBe(true);
          }
        }
      }
    };
    const act = (id: string, action: GameAction) => {
      lobbies.act(lobby, id, action);
      lobbies.broadcast(lobby);
      check();
    };
    const room = (r: 0 | 1) => game.inRoom(r).map((p) => p.id);
    lobbies.broadcast(lobby);
    check();

    // Leaders: each room votes for its first player.
    for (const r of [0, 1] as const) for (const id of room(r)) act(id, { type: "vote", for: room(r)[0] });
    expect(game.phase).toBe("round");

    for (let round = 0; round < 3; round++) {
      const [a, b, c] = room(0);
      act(a, { type: "requestShare", to: b, kind: "color" });
      // Before an answer, nothing is shared.
      lobbies.broadcast(lobby);
      check();
      const colorReq = game.requests.at(-1)?.id ?? "";
      grant(a, b, "team");
      grant(b, a, "team");
      act(b, { type: "answerShare", requestId: colorReq, accept: true });
      act(b, { type: "requestShare", to: c, kind: "card" });
      if (round !== 1) {
        grant(b, c, "card");
        grant(c, b, "card");
      }
      act(c, { type: "answerShare", requestId: game.requests.at(-1)?.id ?? "", accept: round !== 1 });
      const revealer = room(1)[round % room(1).length];
      for (const id of room(1)) if (id !== revealer) grant(id, revealer, "card");
      act(revealer, { type: "reveal" });
      const bookie = game.players.find((p) => p.card === "bookie");
      if (round === 2 && bookie) act(bookie.id, { type: "bookieCall", team: "red" });
      act(game.leaders[0] ?? "", { type: "pickHostage", playerId: room(0)[1] });

      const before = [room(0), room(1)];
      vi.advanceTimersByTime(game.plan[round].seconds * 1000);
      check();
      expect(game.phase).toBe("moving");
      // Each room sent exactly the round's hostage count and kept its leader.
      for (const r of [0, 1] as const) {
        expect(before[r].filter((id) => !room(r).includes(id))).toHaveLength(game.plan[round].hostages);
        expect(room(r)).toContain(game.leaders[r]);
      }
      vi.advanceTimersByTime(10_000 * 0.01);
      check();
    }
    expect(game.phase).toBe("results");
    expect(checked).toBeGreaterThan(100);
    const results = lobbies.view(lobby, ids[1]).game?.results;
    expect(results?.cards).toEqual(game.players.map((p) => ({ id: p.id, card: p.card, team: p.team })));
    expect(results?.cards.map((c) => c.card)).toEqual(expect.arrayContaining(["truth-teller", "liar", "bookie"]));
    expect(results?.bookie?.call).toBe("red");
    const together = game.player(lobby.players.find((p) => game.player(p.id).card === "boss")?.id ?? "").room;
    const busta = game.players.find((p) => p.card === "busta");
    expect(results?.winner).toBe(busta?.room === together ? "red" : "blue");

    lobbies.backToLobby(lobby, host.id);
    expect(lobbies.view(lobby, host.id)).toMatchObject({ phase: "lobby", game: null, you: null });
  });

  it("restores room, known info, votes and timer when a player resumes mid-round", () => {
    vi.useFakeTimers();
    const lobbies = new LobbyManager(6, { timeScale: 0.1 });
    const { lobby, host } = fullLobby(6, lobbies);
    lobbies.deal(lobby, host.id);
    const game = lobby.game;
    if (!game) throw new Error("no game");
    const [a, b] = game.inRoom(0).map((p) => p.id);
    lobbies.act(lobby, a, { type: "vote", for: b });
    lobbies.act(lobby, a, { type: "requestShare", to: b, kind: "card" });
    lobbies.act(lobby, b, { type: "answerShare", requestId: "1", accept: true });
    vi.advanceTimersByTime(6000);
    expect(game.phase).toBe("round");
    const before = lobbies.view(lobby, a);

    const player = lobby.players.find((p) => p.id === a);
    if (!player?.send) throw new Error("no player");
    lobbies.disconnect(lobby, a, player.send);
    vi.advanceTimersByTime(1000);
    lobbies.resume(lobby.code, a, player.token, quiet);
    const after = lobbies.view(lobby, a);
    expect(after.you).toEqual(before.you);
    expect(after.game?.known).toEqual([
      { id: b, team: game.player(b).team, card: game.player(b).card, via: "card share" },
    ]);
    expect(after.game?.votes[a]).toBe(b);
    expect(after.game?.endsAt).toBe(before.game?.endsAt);
    expect(after.game?.phase).toBe("round");
  });

  it("keeps a departed player's card in play and goes on without them", () => {
    const lobbies = new LobbyManager(6, { timeScale: 0.01 });
    const { lobby, host } = fullLobby(6, lobbies);
    lobbies.deal(lobby, host.id);
    const leaver = lobby.players[3].id;
    lobbies.kick(lobby, host.id, leaver);
    expect(lobby.phase).toBe("game");
    expect(lobby.game?.player(leaver).gone).toBe(true);
    expect(lobbies.view(lobby, host.id).game?.players.find((p) => p.id === leaver)?.gone).toBe(true);
    lobbies.backToLobby(lobby, host.id);
  });
});
