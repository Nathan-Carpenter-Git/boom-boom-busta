import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, expect, it } from "vitest";
import { WebSocket, WebSocketServer } from "ws";
import { LobbyManager } from "../server/lobby";
import { attachWs } from "../server/ws";
import type { ClientMessage, LobbyView, ServerMessage } from "../shared/protocol";

const server = createServer();
let url = "";

beforeAll(async () => {
  attachWs(new WebSocketServer({ server, path: "/ws" }), new LobbyManager(6, { timeScale: 0.01 }), 200);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  url = `ws://localhost:${(server.address() as AddressInfo).port}/ws`;
});
afterAll(() => server.close());

class Client {
  ws: WebSocket;
  inbox: ServerMessage[] = [];
  private waiters: (() => void)[] = [];
  constructor() {
    this.ws = new WebSocket(url);
    this.ws.on("message", (raw) => {
      this.inbox.push(JSON.parse(raw.toString()));
      for (const w of this.waiters.splice(0)) w();
    });
  }
  open = () => new Promise((resolve) => this.ws.once("open", resolve));
  send = (msg: ClientMessage) => this.ws.send(JSON.stringify(msg));
  /** The newest lobby view that passes `test`, waiting for one if needed. */
  async view(test: (lobby: LobbyView) => boolean = () => true): Promise<LobbyView> {
    const m = await this.until((m) => (m.type === "lobby" || m.type === "joined") && test(m.lobby), true);
    if (m.type !== "lobby" && m.type !== "joined") throw new Error();
    return m.lobby;
  }
  async until(test: (m: ServerMessage) => boolean, newest = false): Promise<ServerMessage> {
    for (;;) {
      const hit = newest ? [...this.inbox].reverse().find(test) : this.inbox.find(test);
      if (hit) return hit;
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    }
  }
}

it("plays a whole short game over real sockets, with a reconnect mid-round", { timeout: 20_000 }, async () => {
  const host = new Client();
  await host.open();
  host.send({ type: "create", name: "Host" });
  const joined = await host.until((m) => m.type === "joined");
  if (joined.type !== "joined") throw new Error();
  const code = joined.lobby.code;

  const guests = Array.from({ length: 5 }, () => new Client());
  await Promise.all(guests.map((g) => g.open()));
  guests.forEach((g, i) => {
    g.send({ type: "join", code, name: `Guest ${i}` });
  });
  await host.until((m) => m.type === "lobby" && m.lobby.players.length === 6);

  host.send({ type: "deal" });
  const dealt = await Promise.all([host, ...guests].map((c) => c.view((l) => l.game?.phase === "vote")));
  const cards = dealt.map((l) => l.you?.card);
  expect(cards.filter((c) => c === "boss")).toHaveLength(1);
  expect(cards.filter((c) => c === "busta")).toHaveLength(1);
  const clients = [host, ...guests];
  const ids = await Promise.all(
    clients.map(async (c) => ((await c.until((m) => m.type === "joined")) as { playerId: string }).playerId),
  );

  // Everyone votes for the first player in their room, which elects both leaders and starts round 1.
  for (const [i, view] of dealt.entries()) {
    const room = view.game?.rooms[view.you?.room ?? 0].players ?? [];
    clients[i].send({ type: "act", action: { type: "vote", for: room[0] } });
  }
  const round = await host.view((l) => l.game?.phase === "round");
  expect(round.game?.rooms.every((r) => r.leader === r.players[0])).toBe(true);

  // Guest 0 asks a roommate for a card share, and they accept.
  const guestRoom = round.game?.rooms.find((r) => r.players.includes(ids[1]))?.players ?? [];
  const partner = guestRoom.find((id) => id !== ids[1]) ?? "";
  guests[0].send({ type: "act", action: { type: "requestShare", to: partner, kind: "card" } });
  const asked = await clients[ids.indexOf(partner)].view((l) => (l.game?.requests.length ?? 0) > 0);
  clients[ids.indexOf(partner)].send({
    type: "act",
    action: { type: "answerShare", requestId: asked.game?.requests[0].id ?? "", accept: true },
  });
  const learned = await guests[0].view((l) => (l.game?.known.length ?? 0) > 0);
  expect(learned.game?.known).toEqual([
    { id: partner, team: expect.any(String), card: cards[ids.indexOf(partner)], via: "card share" },
  ]);
  // Nobody else learned anything.
  for (const [i, c] of clients.entries()) {
    if (i === 1 || ids[i] === partner) continue;
    expect((await c.view()).game?.known).toEqual([]);
  }

  // A guest drops and comes back with their saved token, keeping the same card.
  const guestJoin = await guests[0].until((m) => m.type === "joined");
  if (guestJoin.type !== "joined") throw new Error();
  guests[0].ws.close();
  await host.until((m) => m.type === "lobby" && m.lobby.players.some((p) => !p.connected));
  const back = new Client();
  await back.open();
  back.send({ type: "resume", code, playerId: guestJoin.playerId, token: guestJoin.token });
  const resumed = await back.view();
  expect(resumed.you?.card).toBe(cards[1]);
  expect(resumed.game?.known.map((k) => k.id)).toEqual([partner]);
  expect(resumed.game?.endsAt).toEqual(expect.any(Number));

  // The timers run the three rounds and exchanges, then everyone sees the same results.
  const live = [host, back, ...guests.slice(1)];
  const finals = await Promise.all(live.map((c) => c.view((l) => l.game?.phase === "results")));
  const results = finals.map((l) => l.game?.results);
  expect(results[0]?.cards).toHaveLength(6);
  for (const r of results) expect(r).toEqual(results[0]);
  const final = finals[0].game;
  const roomOf = (card: string) =>
    final?.rooms.findIndex((r) => r.players.includes(results[0]?.cards.find((c) => c.card === card)?.id ?? ""));
  expect(results[0]?.winner).toBe(roomOf("boss") === roomOf("busta") ? "red" : "blue");
  expect(final?.rooms.map((r) => r.players.length).sort()).toEqual([3, 3]);

  host.send({ type: "backToLobby" });
  await back.view((l) => l.phase === "lobby" && l.game === null);

  for (const c of [host, back, ...guests]) c.ws.close();
});
