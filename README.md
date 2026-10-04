# Boom Boom Busta

A social deduction party game for 6 to 30 players that runs in the browser.
Two teams split across two rooms trade hostages, bluff and vote, and Red wins if the Busta ends the game in the same room as the Boss.

**[How to play](RULES.md)**

Inspired by the party game Two Rooms and a Boom, with its own cards, art and extra rules.
This project is not affiliated with that game or its publisher.

## Run it locally

You need Node.js 22 or newer.

```sh
npm ci
npm run dev
```

Open http://localhost:5173 in a few browser windows to play against yourself.
`MIN_PLAYERS=2 npm run dev` lowers the six player minimum for testing.

## Checks

```sh
npm run lint
npm test
npm run build
```

## Deploy

`render.yaml` deploys the game to Render as one free web service: the Node server serves the built client and the WebSocket on one port.
Lobbies live in memory, so they disappear when the free service sleeps or redeploys.
