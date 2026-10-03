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

<The lead fills these in during the first milestone.>
- Dev server: `npm run dev`
- Everything before a merge: `make check`

## Assets

Game art and audio live in `art/` with their `.asset.json` sidecars, `style.json` and `CREDITS.md`, as in every game project.
Serve them from the build (for example Vite's `public/` pointing at `art/`), keep sprite sheets and audio compressed (WebP or PNG, OGG or MP3), and check sizes: the whole game should load fast on a phone connection.

## Game notes

<The lead fills this in: genre, core loop, controls (keyboard, mouse and touch), target browsers and devices, art direction, and anything a worker must know.>
