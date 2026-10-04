# Boom Boom Busta

A browser game, started 2026-10-03.
The rules every project follows are in `/srv/CLAUDE.md`; this file adds what is specific to this game.

## First milestone

Before any feature work, agree the game concept and the stack with the owner, then set up in one commit:
- TypeScript with Vite, and an engine that fits the game: Phaser for 2D, Three.js for 3D, or React for UI-heavy and party games (Headbands is an example of the React route).
- A formatter and linter, a test runner with one real test, and `make check` that runs lint, tests, a production build and a capture.
- `make capture`: `web-capture http://localhost:5173 -o build/capture --serve "npm run dev"` (add `--wait <server url>` if there is a backend, `--pages N` for multiplayer, and `--mobile` if phones matter).
- A GitHub Actions workflow that runs lint, tests and the build on every push.
Record the choices under `## Decisions` in STATE.md.

## Commands

- Setup: `npm ci`.
- Dev server: `npm run dev` (game server on 8080 with `tsx watch`, Vite client on 5173 proxying `/ws`).
  `MIN_PLAYERS=2 npm run dev` lowers the six player minimum for local testing.
  `ROUND_SECONDS_SCALE=0.1 npm run dev` multiplies every game timer (leader vote, rounds, hostages moving), so a whole game takes about a minute.
- Multiplayer screenshots: `make play` builds, then plays a short game with six phone-size Chromium pages (`tools/play-game.ts`, `PLAYERS=7` adds the Bookie) and saves every screen to `build/play/`.
- Everything before a merge: `make check` (Biome lint, Vitest, production build, phone capture).
- Format: `npm run format`.
- Card gallery for art review: open `/?cards`.
- Production: `npm run build && npm start` serves the client and the WebSocket from one port (`PORT`), as on Render.

## Assets

Game art and audio live in `art/` with their `.asset.json` sidecars, `style.json` and `CREDITS.md`, as in every game project.
Serve them from the build (for example Vite's `public/` pointing at `art/`), keep sprite sheets and audio compressed (WebP or PNG, OGG or MP3), and check sizes: the whole game should load fast on a phone connection.

## Game notes

- Social deduction party game that follows the Two Rooms and a Boom ruleset exactly, with our own names and art: Blue team protects **the Boss**, Red team's **Busta** must end the last round in the Boss's room; odd player counts add **the Bookie** (grey).
  Rooms are "The Basement" and "The Rooftop".
  Never use the original game's card art, card text or logo.
- Layout: `shared/` (cards, rules, protocol types), `server/` (Node, `ws`, in-memory `LobbyManager`), `client/` (React, Vite), `tests/` (Vitest, including a real socket test).
- The server is authoritative and sends each player only their own card (`LobbyView.you`), plus what shares, public reveals and the final reveal entitle them to; tests check that nothing else leaks in any phase.
- Game logic lives in `server/game.ts` (`Game`, pure, time passed in); `LobbyManager` runs its timers. A player removed mid-game (kicked, or gone past the grace period) keeps their card in play and can still be sent as a hostage; a departed leader is replaced by a fresh room vote.
- Hosting: Render free tier, one web service (`render.yaml`).
  It sleeps after about 15 idle minutes, so the client shows a "waking up" banner; lobbies live in memory and vanish on sleep or redeploy; the server pings sockets every 25 s; a dropped player keeps their seat for 3 minutes and resumes with a token from localStorage.
- Players are mostly on phones: design for touch at 390 px wide first.
- Card art is SVG drawn in code (`client/src/CardArt.tsx`), one shared frame per card, chunky ink outlines, halftone team colours.
