# Boom Boom Busta: state

## Goal
A browser version of Two Rooms and a Boom with our own cards and art: two teams split across two rooms, trading hostages, and Red wins if the Busta ends in the same room as the Boss.
New cards add more bluffing and social manipulation than the original.

## Now
- Worker `special-cards` builds the host card picker plus the Truth Teller and Liar; Influence waits on the owner.

## Next
- Review and merge `work/special-cards`.
- After the owner approves RULES.md: build Influence, then the Truth Teller and Liar.
- Render deploy once the owner connects the repo (render.yaml is ready).

## Done
- 2026-10-04: merged the base round loop (`server/game.ts`, `client/src/Game.tsx`): leader vote and usurp, shares, public reveal, hostages, Bookie, results; 31 tests; `make play` plays a six phone game and saves screens to `build/play/`.
- 2026-10-04: fixed gaps inside words on the home cards (Chrome glyph snapping; `text-rendering: geometricPrecision`) and spread the card fan.
- 2026-10-04: stack, lobby with 4 letter codes and invite links, reconnect, dealing cards into two rooms, SVG art for the five base cards, 13 tests, CI, `make check`.
- 2026-10-03: project created from the agent-kit game template.

## Decisions
- 2026-10-04: the host turns any special cards on in any mix, whatever the player count; extras are dealt at random; either-team specials balance teams. Truth Teller and Liar approved.
- 2026-10-04: a player who leaves mid-game keeps their card in play (can still be sent as a hostage); a departed leader triggers a re-vote.
- 2026-10-04: owner picked Influence (option A) and said it can't be traded; added Truth Teller and Liar cards (either team). Bluff and leader power ideas are dropped.
- 2026-10-04: React + Vite + TypeScript client, Node + `ws` server, shared types, one npm package (the Headbands pattern, already proven on Render's free tier).
- 2026-10-04: one Render web service serves the client and the WebSocket on one origin; lobbies in memory, no database or accounts.
- 2026-10-04: Biome for lint and format, Vitest for tests.
- 2026-10-04: theme names: the Boss (blue VIP), the Busta (red bomber), Blue Crew, Red Crew, the Bookie (grey, odd counts); rooms are The Basement and The Rooftop.

## Open questions
- Do players sit in two real rooms with phones as cards, or play fully online over voice (in-app room chat, or two Discord voice channels)?
- Influence costs in RULES.md (start 2, +1 a round; Campaign 1, Shield 2, Demand color 2, Demand card 4): approved? Should it be a host toggle too?
- Should pushes to `main` auto-deploy on Render (if so, switch to branches and pull requests)?
