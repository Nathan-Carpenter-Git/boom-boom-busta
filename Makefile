.PHONY: check lint test build capture

check: lint test build capture

lint:
	npm run lint

test:
	npm test

build:
	npm run build

capture:
	web-capture http://localhost:5173 -o build/capture --serve "npm run dev" --wait http://localhost:8080/health --mobile --click "text=Create a lobby"
