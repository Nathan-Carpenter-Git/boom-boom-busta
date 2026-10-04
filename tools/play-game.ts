// Plays a whole game in headless Chromium with one phone-size page per player, and saves
// screenshots of every screen to build/play/. web-capture only drives one page, so this covers
// the multiplayer flow. Needs a production build first: `make play` runs both.
//
//   PLAYERS=7 ROUND_SECONDS_SCALE=0.1 npx tsx tools/play-game.ts

import { type ChildProcess, spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { chromium, type Page } from "playwright";

const PLAYERS = Number(process.env.PLAYERS ?? 6);
const PORT = Number(process.env.PLAY_PORT ?? 8097);
const SCALE = process.env.ROUND_SECONDS_SCALE ?? "0.1";
const OUT = "build/play";
const URL = `http://localhost:${PORT}`;
const NAMES = ["Sneaky Pete", "Shady Lou", "Slick Mo", "Jumpy Dot", "Sly Vic", "Fuzzy Bea", "Lucky Sal", "Smooth Gus"];

async function startServer(): Promise<ChildProcess> {
  const server = spawn("node", ["dist/server/server/index.js"], {
    env: { ...process.env, PORT: String(PORT), ROUND_SECONDS_SCALE: SCALE },
    stdio: "inherit",
  });
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`${URL}/health`)).ok) return server;
    } catch {
      // Not up yet.
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  server.kill();
  throw new Error("The server did not start; run `npm run build` first");
}

const problems: string[] = [];

/** Saves a screenshot and records any horizontal overflow, which phones show as sideways scrolling. */
async function shot(page: Page, name: string) {
  await page.waitForTimeout(150);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (overflow > 0) problems.push(`${name}: ${overflow}px horizontal overflow`);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  console.log(`saved ${OUT}/${name}.png`);
}

const roomNames = (page: Page) =>
  page.locator(".room-players .pname").evaluateAll((els) => els.map((el) => el.childNodes[0]?.textContent ?? ""));

async function main() {
  mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch();
  try {
    const pages: Page[] = [];
    for (let i = 0; i < PLAYERS; i++) {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      });
      pages.push(await context.newPage());
    }
    const [host] = pages;
    // The client asks before ending or leaving a game.
    for (const page of pages) page.on("dialog", (d) => d.accept());

    await host.goto(URL);
    await host.getByLabel("Your name").fill(NAMES[0]);
    await host.getByRole("button", { name: "Create a lobby" }).click();
    const code = (await host.locator(".code").textContent()) ?? "";
    for (const [i, page] of pages.entries()) {
      if (i === 0) continue;
      await page.goto(`${URL}/?code=${code}`);
      await page.getByLabel("Your name").fill(NAMES[i]);
      await page.getByRole("button", { name: "Join" }).click();
      await page.locator(".code").waitFor();
    }
    await host.getByText(`Players ${PLAYERS}`).waitFor();
    await host.getByRole("button", { name: "Deal cards" }).click();

    // Leader vote: everyone backs the first player listed in their room.
    await Promise.all(pages.map((p) => p.locator(".room-players").waitFor()));
    await shot(pages[1], "1-vote");
    for (const page of pages) {
      await page.locator(".room-players .row-main").first().click();
      await page.locator(".row-actions .btn").first().click();
      await page.locator(".room-players .row-main").first().click();
    }
    await host.getByText(/Round 1 of 3/).waitFor();

    // A card share: the first player who is not a leader asks a roommate.
    const sendButtons = await Promise.all(pages.map((p) => p.locator(".btn.send").count()));
    const asker = pages[sendButtons.indexOf(0)];
    const askerRoom = await roomNames(asker);
    const askerName = NAMES[pages.indexOf(asker)];
    const targetName = askerRoom.find((n) => n !== askerName) ?? "";
    const target = pages[NAMES.indexOf(targetName)];
    await asker.locator(".room-players li", { hasText: targetName }).locator(".row-main").click();
    await asker.getByRole("button", { name: "Ask card share" }).click();
    await target.locator(".requests").waitFor();
    await target.locator(".card-button").click();
    await shot(target, "2-round-request");
    await target.getByRole("button", { name: "Share", exact: true }).click();
    await asker.locator(".known li").waitFor();
    // Open a roommate's row to show the vote and share actions.
    const row = asker.locator(".room-players li", { hasText: targetName }).locator(".row-main");
    if ((await asker.locator(".row-actions").count()) === 0) await row.click();
    await shot(asker, "3-round-known");

    for (let round = 0; round < 3; round++) {
      await host.getByText(`Round ${round + 1} of 3`).waitFor({ timeout: 60_000 });
      // Each leader sends the last player listed in their room.
      for (const page of pages) {
        const send = page.locator(".btn.send");
        if ((await send.count()) > 0) await send.last().click();
      }
      if (round === 0) {
        const leader = (await Promise.all(pages.map((p) => p.locator(".btn.send").count()))).findIndex((n) => n > 0);
        await shot(pages[leader], "4-leader-picks");
      }
      if (round === 2) {
        for (const page of pages) {
          const call = page.getByRole("button", { name: "Red wins" });
          if ((await call.count()) > 0) {
            await call.click();
            await shot(page, "5-bookie-call");
          }
        }
      }
      await host.locator(".moving").waitFor({ timeout: 60_000 });
      if (round === 0) await shot(host, "6-moving");
    }

    await Promise.all(pages.map((p) => p.locator(".results").waitFor({ timeout: 60_000 })));
    await shot(host, "7-results");
    await shot(pages[1], "7-results-guest");
    await host.getByRole("button", { name: "Back to the lobby" }).click();
    await pages[1].getByText("Waiting for the host to deal the cards.").waitFor();
    console.log(problems.length ? `Problems:\n${problems.join("\n")}` : "No horizontal overflow on any screen");
  } finally {
    await browser.close();
    server.kill();
  }
  if (problems.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
