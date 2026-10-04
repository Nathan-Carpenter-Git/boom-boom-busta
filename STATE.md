# Boom Boom Busta: state

## Goal
A browser version of Two Rooms and a Boom with our own cards and art: two teams split across two rooms, trading hostages, and Red wins if the Busta ends in the same room as the Boss.
New cards add more bluffing and social manipulation than the original.

## Now
- Lobby done; waiting on the owner: online vs same-room play, and which new cards to build.

## Next
- Round loop: room timers, leader election and usurping, hostage picks and the simultaneous exchange, card share and color share, the final reveal and winner.
- Then the new cards the owner picks.
- Render deploy once the owner connects the repo (render.yaml is ready).

## Done
- 2026-10-04: stack, lobby with 4 letter codes and invite links, reconnect, dealing cards into two rooms, SVG art for the five base cards, 13 tests, CI, `make check`.
- 2026-10-03: project created from the agent-kit game template.

## Decisions
- 2026-10-04: React + Vite + TypeScript client, Node + `ws` server, shared types, one npm package (the Headbands pattern, already proven on Render's free tier).
- 2026-10-04: one Render web service serves the client and the WebSocket on one origin; lobbies in memory, no database or accounts.
- 2026-10-04: Biome for lint and format, Vitest for tests.
- 2026-10-04: theme names: the Boss (blue VIP), the Busta (red bomber), Blue Crew, Red Crew, the Bookie (grey, odd counts); rooms are The Basement and The Rooftop.

## Open questions
- Do players sit in two real rooms with phones as cards, or play fully online over voice (in-app room chat, or two Discord voice channels)?
- Which of the proposed new cards to build first.
- Should pushes to `main` auto-deploy on Render (if so, switch to branches and pull requests)?
