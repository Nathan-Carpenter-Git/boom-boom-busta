.PHONY: check lint test build capture play

check: lint test build capture

lint:
	npm run lint

test:
	npm test

build:
	npm run build

capture:
	web-capture http://localhost:5173 -o build/capture --serve "npm run dev" --wait http://localhost:8080/health --mobile --click "text=Create a lobby"

# Six phones play a short game in Chromium; screenshots of every screen land in build/play/.
play: build
	npx tsx tools/play-game.ts
