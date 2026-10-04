import { existsSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { WebSocketServer } from "ws";
import { LobbyManager } from "./lobby.js";
import { attachWs } from "./ws.js";

const PORT = Number(process.env.PORT ?? 8080);
const MIN_PLAYERS = process.env.MIN_PLAYERS ? Number(process.env.MIN_PLAYERS) : undefined;
// For example 0.1 plays a whole game in about a minute, for dev and tests.
const ROUND_SECONDS_SCALE = process.env.ROUND_SECONDS_SCALE ? Number(process.env.ROUND_SECONDS_SCALE) : undefined;
const here = path.dirname(fileURLToPath(import.meta.url));

const lobbies = new LobbyManager(MIN_PLAYERS, { timeScale: ROUND_SECONDS_SCALE });
const app = express();
app.get("/health", (_req, res) => {
  res.json({ ok: true, lobbies: lobbies.lobbyCount });
});

// In production this one service also serves the built client: one Render web service, one
// origin, so the WebSocket needs no CORS or second URL. In dev, Vite serves the client.
const clientDist = [path.resolve(here, "../../client"), path.resolve(here, "../dist/client")].find((dir) =>
  existsSync(path.join(dir, "index.html")),
);
if (clientDist) {
  app.use(express.static(clientDist, { maxAge: "1h", index: false }));
  app.get("/{*path}", (_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

const server = createServer(app);
attachWs(new WebSocketServer({ server, path: "/ws" }), lobbies);
server.listen(PORT, () => {
  console.log(`Boom Boom Busta server on http://localhost:${PORT}`);
});
