import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, expect, it } from "vitest";
import { WebSocket, WebSocketServer } from "ws";
import { LobbyManager } from "../server/lobby";
import { attachWs } from "../server/ws";
import type { ClientMessage, ServerMessage } from "../shared/protocol";

const server = createServer();
let url = "";

beforeAll(async () => {
  attachWs(new WebSocketServer({ server, path: "/ws" }), new LobbyManager(), 200);
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
  async until(test: (m: ServerMessage) => boolean): Promise<ServerMessage> {
    for (;;) {
      const hit = this.inbox.find(test);
      if (hit) return hit;
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    }
  }
}

it("plays create, join by code, deal and reconnect over real sockets", async () => {
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
  const dealt = await Promise.all(
    [host, ...guests].map((c) => c.until((m) => m.type === "lobby" && m.lobby.phase === "dealt")),
  );
  const cards = dealt.map((m) => (m.type === "lobby" ? m.lobby.you?.card : undefined));
  expect(cards.filter((c) => c === "boss")).toHaveLength(1);
  expect(cards.filter((c) => c === "busta")).toHaveLength(1);

  // A guest drops and comes back with their saved token, keeping the same card.
  const guestJoin = await guests[0].until((m) => m.type === "joined");
  if (guestJoin.type !== "joined") throw new Error();
  guests[0].ws.close();
  await host.until((m) => m.type === "lobby" && m.lobby.players.some((p) => !p.connected));
  const back = new Client();
  await back.open();
  back.send({ type: "resume", code, playerId: guestJoin.playerId, token: guestJoin.token });
  const resumed = await back.until((m) => m.type === "joined");
  expect(resumed.type === "joined" && resumed.lobby.you?.card).toBe(cards[1]);

  for (const c of [host, back, ...guests]) c.ws.close();
});
